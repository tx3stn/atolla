import type { Transport } from 'atolla_core/src/transports/Transport';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ConnectionMode } from '../models/App';
import type { BarColorStore } from '../stores/BarColor';
import type { PinnedItemsStore } from '../stores/PinnedItems';
import type { Preferences } from '../stores/Preferences';
import type { ArtworkPaletteService } from './ArtworkPaletteService';
import type { LyricsService } from './LyricsService';
import type { NetworkStatus } from './NetworkStatus';
import type { PaletteGenerationQueue } from './PaletteGenerationQueue';
import type { PlaybackOrchestrator } from './PlaybackOrchestrator';
import type { ToastService } from './ToastService';
import type { ViewCache } from './ViewCache';

export interface AppServicesBag {
	barColors: BarColorStore;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	downloadService: DownloadService;
	lyricsService: LyricsService;
	modalSlot: DetachedSlot;
	networkStatus: NetworkStatus;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	paletteQueue: PaletteGenerationQueue;
	paletteService: ArtworkPaletteService;
	pinnedItemsStore?: PinnedItemsStore;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	toastService: ToastService;
	toastSlot: DetachedSlot;
	transport: Transport;
	viewCache: ViewCache;
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
			previous.connectionMode !== next.connectionMode ||
			previous.downloadingCount !== next.downloadingCount ||
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
