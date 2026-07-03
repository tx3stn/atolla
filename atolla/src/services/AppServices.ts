import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { BarColorStore } from '../stores/BarColor';
import type { PlaybackStore } from '../stores/Playback';
import type { LanguageCode } from '../stores/Preferences';
import type { ConnectionMode } from '../transports/Model';
import type { Transport } from '../transports/Transport';
import type { ArtworkPaletteService } from './ArtworkPaletteService';
import type { DownloadService } from './DownloadService';
import type { ImageCache } from './ImageCache';
import type { PaletteGenerationQueue } from './PaletteGenerationQueue';
import type { PlaybackOrchestrator } from './PlaybackOrchestrator';
import type { ToastService } from './ToastService';

export interface AppServicesBag {
	animationsEnabled: boolean;
	barColors: BarColorStore;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	language: LanguageCode;
	modalSlot: DetachedSlot;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	paletteQueue: PaletteGenerationQueue;
	paletteService: ArtworkPaletteService;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	toastSlot: DetachedSlot;
	transport: Transport;
}

type AppServicesListener = () => void;

export class AppServices {
	private bag?: AppServicesBag;
	private readonly listeners = new Set<AppServicesListener>();

	get ready(): boolean {
		return this.bag !== undefined;
	}

	clear(): void {
		if (this.bag === undefined) {
			return;
		}
		this.bag = undefined;
		this.notify();
	}

	get(): AppServicesBag | undefined {
		return this.bag;
	}

	set(bag: AppServicesBag): void {
		const previous = this.bag;
		this.bag = bag;
		if (previous === undefined || this.changed(previous, bag)) {
			this.notify();
		}
	}

	subscribe(listener: AppServicesListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private changed(previous: AppServicesBag, next: AppServicesBag): boolean {
		return (
			previous.animationsEnabled !== next.animationsEnabled ||
			previous.connectionMode !== next.connectionMode ||
			previous.downloadingCount !== next.downloadingCount ||
			previous.gridColumns !== next.gridColumns ||
			previous.language !== next.language ||
			previous.transport !== next.transport
		);
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			listener();
		}
	}
}

export const appServices = new AppServices();
