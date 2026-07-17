import { PersistentStore } from 'persistence/src/PersistentStore';
import { setAtollaImageCachedObserver } from '../ImageLoaderBootstrap';
import type { KeyValueStore } from '../stores/KeyValueStore';
import type { PlaybackStore } from '../stores/Playback';
import { RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import { SearchStore } from '../stores/Search';
import {
	getAtollaAudioPlaybackCurrentTrackId,
	getAtollaAudioPlaybackIsActive,
	getAtollaAudioPlaybackPositionMs,
} from '../TrackPlaybackNative';
import type { Transport } from '../transports/Transport';
import { ArtworkPaletteService } from './ArtworkPaletteService';
import type { AssetCache } from './AssetCache';
import type { DownloadService } from './DownloadService';
import { OnThisDayService } from './OnThisDayService';
import { PaletteGenerationQueue } from './PaletteGenerationQueue';
import { PersistentPaletteStore } from './PersistentPaletteStore';
import { PersistentWaveformStore } from './PersistentWaveformStore';
import type { PlaybackOrchestrator } from './PlaybackOrchestrator';
import type { PlaylistCreateService } from './PlaylistCreateService';
import type { PlaylistEditService } from './PlaylistEditService';
import { RecentlyAddedService } from './RecentlyAddedService';
import { ReconnectSyncCoordinator } from './ReconnectSyncCoordinator';
import { ScrobbleService } from './ScrobbleService';
import { VIEW_CACHE_MAX_BYTES, VIEW_CACHE_MAX_ENTRIES, ViewCache } from './ViewCache';
import { WaveformGenerationQueue } from './WaveformGenerationQueue';
import { WaveformRenderCache } from './WaveformRenderCache';
import { WaveformService } from './WaveformService';
import { WriteBehindPaletteStore } from './WriteBehindPaletteStore';

export interface UserScopeDeps {
	assetCache: AssetCache;
	downloadService: DownloadService;
	getTransport(): Transport;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
	playlistCreateService: PlaylistCreateService;
	playlistEditService: PlaylistEditService;
	requestRerender(): void;
}

// Owns the per-user data layer: every service scoped to the active user (search history, palettes,
// waveforms, scrobbles, recently-played, home caches, now-playing queue) plus the reconnect
// coordinator. activate(userId) rebuilds them and wires them into the app-global playback services.
export class UserScope {
	private onThisDayService?: OnThisDayService;
	private paletteQueue!: PaletteGenerationQueue;
	private paletteService!: ArtworkPaletteService;
	private reconnectSync?: ReconnectSyncCoordinator;
	private recentlyAddedService?: RecentlyAddedService;
	private searchStore!: SearchStore;
	private unsubscribePalette?: () => void;
	private viewCache!: ViewCache;

	constructor(private readonly deps: UserScopeDeps) {}

	activate(userId: string): void {
		if (this.unsubscribePalette) {
			this.unsubscribePalette();
		}
		this.searchStore = new SearchStore(
			new PersistentStore(`atolla/user/${userId}/search_history`, { deviceGlobal: true }),
		);
		const recentlyPlayed = new RecentlyPlayedStore(
			new PersistentStore(`atolla/user/${userId}/recently_played`, { deviceGlobal: true }),
		);
		const nowPlayingQueueStore: KeyValueStore = new PersistentStore(
			`atolla/user/${userId}/now_playing_queue`,
			{ deviceGlobal: true },
		);
		void this.deps.playbackStore.setQueueStore(
			nowPlayingQueueStore,
			() => {
				try {
					return getAtollaAudioPlaybackIsActive();
				} catch {
					return false;
				}
			},
			() => {
				try {
					const trackId = getAtollaAudioPlaybackCurrentTrackId();
					if (!trackId) return null;
					return {
						positionSeconds: Math.max(0, getAtollaAudioPlaybackPositionMs() / 1000),
						trackId,
					};
				} catch {
					return null;
				}
			},
		);
		const homeAlbumsStore: KeyValueStore = new PersistentStore(`atolla/user/${userId}/home`, {
			deviceGlobal: true,
		});
		void (homeAlbumsStore as { remove?(key: string): Promise<void> })
			.remove?.('albums_v1')
			.catch(() => {});
		this.onThisDayService = new OnThisDayService(homeAlbumsStore);
		this.recentlyAddedService = new RecentlyAddedService(homeAlbumsStore);
		void this.onThisDayService.ensureLoaded();
		this.viewCache = new ViewCache({
			disk: new PersistentStore(`atolla/user/${userId}/view`, {
				deviceGlobal: true,
				maxWeight: VIEW_CACHE_MAX_BYTES,
			}),
			maxEntries: VIEW_CACHE_MAX_ENTRIES,
		});
		this.paletteService = new ArtworkPaletteService(
			new WriteBehindPaletteStore(
				new PersistentPaletteStore(
					new PersistentStore(`atolla/user/${userId}/artwork_palettes`, { deviceGlobal: true }),
				),
			),
		);
		this.paletteQueue = new PaletteGenerationQueue(this.paletteService);
		const scrobble = new ScrobbleService({
			deliverScrobble: (pending) =>
				this.deps.getTransport().scrobbleTrackPlayed(pending.trackId, pending.triggeredAt),
			store: new PersistentStore(`atolla/user/${userId}/pending_scrobbles`, { deviceGlobal: true }),
		});
		const waveformService = new WaveformService(
			new PersistentWaveformStore(
				new PersistentStore(`atolla/user/${userId}/waveform_data`, { deviceGlobal: true }),
			),
		);
		const waveformRenderCache = new WaveformRenderCache();
		const waveformQueue = new WaveformGenerationQueue(waveformService);
		this.deps.playbackOrchestrator.setUserServices({
			disposeWaveformQueue: () => waveformQueue.dispose(),
			enqueueWaveform: (trackId, audioPath) => waveformQueue.enqueue(trackId, audioPath),
			paletteQueue: this.paletteQueue,
			paletteService: this.paletteService,
			recentlyPlayed,
			reorderWaveformQueue: (trackIds) => waveformQueue.reorderToMatch(trackIds),
			scrobble,
			waveformRenderCache,
			waveformService,
		});
		this.reconnectSync = new ReconnectSyncCoordinator({
			downloadService: this.deps.downloadService,
			playlistCreateService: this.deps.playlistCreateService,
			playlistEditService: this.deps.playlistEditService,
			scrobbleService: scrobble,
		});
		try {
			setAtollaImageCachedObserver((url, category) => {
				this.deps.assetCache.resolveCachedImageWaiters(url, category);
				if (category !== 'album_art' || this.paletteService.hasPalette(url)) {
					return;
				}
				this.paletteQueue.enqueue(url);
			});
		} catch {
			// observer bridge unavailable on non-Android targets
		}
		this.unsubscribePalette = this.paletteService.subscribe(() => this.deps.requestRerender());
		// on the login path activate() runs after the home view has already mounted with these
		// services undefined, so re-render to flow the newly created services into the view models
		this.deps.requestRerender();
	}

	dispose(): void {
		if (this.unsubscribePalette) {
			this.unsubscribePalette();
		}
		this.paletteQueue?.dispose();
	}

	getOnThisDayService(): OnThisDayService | undefined {
		return this.onThisDayService;
	}

	getPaletteQueue(): PaletteGenerationQueue {
		return this.paletteQueue;
	}

	getPaletteService(): ArtworkPaletteService {
		return this.paletteService;
	}

	getReconnectSync(): ReconnectSyncCoordinator | undefined {
		return this.reconnectSync;
	}

	getRecentlyAddedService(): RecentlyAddedService | undefined {
		return this.recentlyAddedService;
	}

	getSearchStore(): SearchStore {
		return this.searchStore;
	}

	getViewCache(): ViewCache {
		return this.viewCache;
	}
}
