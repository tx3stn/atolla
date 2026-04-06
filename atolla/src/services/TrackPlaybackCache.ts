// @ts-nocheck
import { DEFAULT_TRACK_CACHE_MAX_TRACKS } from '../stores/Preferences';

declare const require: (moduleName: string) => any;

interface TrackCacheStore {
	exists(key: string): Promise<boolean>;
	fetch(key: string): Promise<ArrayBuffer>;
	fetchAll?(): Promise<Record<string, unknown>>;
	fetchString?(key: string): Promise<string>;
	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void>;
	storeString?(key: string, value: string, ttlSeconds?: number, weight?: number): Promise<void>;
}

type TrackCacheStoreFactory = (maxTracks: number) => TrackCacheStore;

interface FileSystemLike {
	createDirectorySync(path: string, createIntermediates: boolean): boolean;
	currentWorkingDirectory(): string;
	readFileSync(path: string, options?: { encoding?: 'utf8' | 'utf16' }): string | ArrayBuffer;
	writeFileSync(path: string, data: ArrayBuffer | string): void;
}

function createPersistentTrackStore(maxTracks: number): TrackCacheStore {
	try {
		const { PersistentStore } = require('persistence/src/PersistentStore');
		return new PersistentStore('track_playback_cache', {
			maxWeight: maxTracks,
		});
	} catch {
		return {
			exists: () => Promise.resolve(false),
			fetch: () => Promise.reject(new Error('track cache unavailable')),
			fetchString: () => Promise.reject(new Error('track cache unavailable')),
			store: () => Promise.resolve(),
			storeString: () => Promise.resolve(),
		};
	}
}

export class TrackPlaybackCache {
	private maxTracks: number;
	private store: TrackCacheStore;
	private sourceCache = new Map<string, string>();
	private fs: FileSystemLike | null = createFileSystem();
	private filesDirPath: string | null = null;
	private lastFileWriteError: string | null = this.fs ? null : 'E_FS_UNAVAILABLE';

	constructor(
		private readonly storeFactory: TrackCacheStoreFactory = createPersistentTrackStore,
		initialMaxTracks = DEFAULT_TRACK_CACHE_MAX_TRACKS,
	) {
		this.maxTracks = initialMaxTracks;
		this.store = this.storeFactory(this.maxTracks);
	}

	configureMaxTracks(maxTracks: number): void {
		if (!Number.isFinite(maxTracks) || maxTracks <= 0) {
			return;
		}

		if (maxTracks === this.maxTracks) {
			return;
		}

		this.maxTracks = maxTracks;
		this.store = this.storeFactory(maxTracks);
		this.sourceCache.clear();
	}

	async hasTrack(trackId: string): Promise<boolean> {
		if (!trackId) {
			return false;
		}

		if (this.sourceCache.has(trackId)) {
			return true;
		}

		const persistedPath = await this.fetchPersistedFilePath(trackId);
		if (persistedPath) {
			return true;
		}

		try {
			return await this.store.exists(this.storeKey(trackId));
		} catch {
			return false;
		}
	}

	async fetchTrack(trackId: string): Promise<ArrayBuffer | null> {
		if (!trackId) {
			return null;
		}

		try {
			return await this.store.fetch(this.storeKey(trackId));
		} catch {
			return null;
		}
	}

	async getPlayableSource(trackId: string, fallbackUrl: string | null): Promise<string | null> {
		if (!trackId) {
			return fallbackUrl;
		}

		const cachedSource = this.sourceCache.get(trackId);
		if (cachedSource) {
			return cachedSource;
		}

		const persistedPath = await this.fetchPersistedFilePath(trackId);
		if (persistedPath) {
			this.sourceCache.set(trackId, persistedPath);
			return persistedPath;
		}

		const buffer = await this.fetchTrack(trackId);
		if (!buffer) {
			return fallbackUrl;
		}

		const mimeType = await this.fetchMimeType(trackId);
		const source = this.writeTrackFile(trackId, buffer, mimeType);
		if (!source) {
			return fallbackUrl;
		}
		this.sourceCache.set(trackId, source);
		return source;
	}

	async getCachedTrackCount(): Promise<number> {
		try {
			const all = await this.store.fetchAll?.();
			if (!all) {
				return this.sourceCache.size;
			}

			const keys = Object.keys(all);
			let count = 0;
			for (const key of keys) {
				if (key.startsWith('track_file_path:')) {
					count += 1;
					continue;
				}

				if (key.startsWith('track_file:') && !key.startsWith('track_file_mime:')) {
					count += 1;
				}
			}
			return count;
		} catch {
			return this.sourceCache.size;
		}
	}

	async storeTrack(trackId: string, value: ArrayBuffer, mimeType = 'audio/mpeg'): Promise<void> {
		if (!trackId || value.byteLength === 0) {
			return;
		}

		await this.store.store(this.storeKey(trackId), value, undefined, 1);
		await this.store.storeString?.(this.mimeKey(trackId), mimeType);
		const fileSource = this.writeTrackFile(trackId, value, mimeType);
		if (!fileSource) {
			throw new Error(this.lastFileWriteError ?? 'track file write failed');
		}

		await this.store.storeString?.(this.pathKey(trackId), fileSource);
		this.sourceCache.set(trackId, fileSource);
	}

	private storeKey(trackId: string): string {
		return `track_file:${trackId}`;
	}

	private mimeKey(trackId: string): string {
		return `track_file_mime:${trackId}`;
	}

	private pathKey(trackId: string): string {
		return `track_file_path:${trackId}`;
	}

	private async fetchMimeType(trackId: string): Promise<string> {
		try {
			return (await this.store.fetchString?.(this.mimeKey(trackId))) ?? 'audio/mpeg';
		} catch {
			return 'audio/mpeg';
		}
	}

	private async fetchPersistedFilePath(trackId: string): Promise<string | null> {
		try {
			const value = await this.store.fetchString?.(this.pathKey(trackId));
			if (!value || !value.startsWith('file://')) {
				return null;
			}
			return value;
		} catch {
			return null;
		}
	}

	private writeTrackFile(trackId: string, value: ArrayBuffer, mimeType: string): string | null {
		if (!this.fs) {
			this.lastFileWriteError = 'E_FS_UNAVAILABLE';
			return null;
		}

		const extension = extensionFromMimeType(mimeType);
		const sanitizedTrackId = encodeURIComponent(trackId);
		const fileName = `${sanitizedTrackId}.${extension}`;

		const directoryPath = this.ensureFilesDirectoryPath();
		const filePath = directoryPath
			? `${directoryPath}/${fileName}`
			: this.fallbackFilePath(fileName);

		if (!filePath) {
			if (!this.lastFileWriteError) {
				this.lastFileWriteError = 'E_FS_DIR_UNRESOLVED';
			}
			return null;
		}

		try {
			this.fs.writeFileSync(filePath, value);
			this.lastFileWriteError = null;
			return `file://${filePath}`;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error ?? 'unknown');
			this.lastFileWriteError = `E_FS_WRITE_FAILED:${message}`;
			return null;
		}
	}

	private ensureFilesDirectoryPath(): string | null {
		if (!this.fs) {
			this.lastFileWriteError = 'E_FS_UNAVAILABLE';
			return null;
		}

		if (this.filesDirPath) {
			return this.filesDirPath;
		}

		try {
			const cwd = this.fs.currentWorkingDirectory();
			const directoryPath = `${cwd}/atolla-track-playback-cache`;
			this.fs.createDirectorySync(directoryPath, true);
			this.filesDirPath = directoryPath;
			this.lastFileWriteError = null;
			return directoryPath;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error ?? 'unknown');
			this.lastFileWriteError = `E_FS_MKDIR_FAILED:${message}`;
			return null;
		}
	}

	private fallbackFilePath(fileName: string): string | null {
		if (!this.fs) {
			this.lastFileWriteError = 'E_FS_UNAVAILABLE';
			return null;
		}

		try {
			const cwd = this.fs.currentWorkingDirectory();
			if (!cwd) {
				this.lastFileWriteError = 'E_FS_DIR_UNRESOLVED';
				return null;
			}
			return `${cwd}/${fileName}`;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error ?? 'unknown');
			this.lastFileWriteError = `E_FS_DIR_UNRESOLVED:${message}`;
			return null;
		}
	}
}

function createFileSystem(): FileSystemLike | null {
	try {
		const module = require('file_system/src/FileSystem') as {
			fs: FileSystemLike;
		};
		return module.fs;
	} catch {
		return null;
	}
}

function extensionFromMimeType(mimeType: string): string {
	const normalized = (mimeType ?? '').toLowerCase();
	if (normalized.includes('aac')) return 'aac';
	if (normalized.includes('flac')) return 'flac';
	if (normalized.includes('ogg')) return 'ogg';
	if (normalized.includes('wav')) return 'wav';
	if (normalized.includes('m4a') || normalized.includes('mp4')) return 'm4a';
	return 'mp3';
}
