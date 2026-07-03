import { Device } from 'valdi_core/src/Device';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Album } from '../models/Album';
import { type FooterTab, FooterTabs, type HeaderTab } from '../models/App';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import { appServices } from '../services/AppServices';
import { backNavRouter } from '../services/BackNavRouter';
import { type DetailPushDeps, pushAlbum, pushArtist, pushPlaylist } from '../ui/flows/PushDetail';
import { headerStore } from './Header';

type AppShellListener = () => void;

export class AppShellStore {
	private activeTab: FooterTab = FooterTabs.home;
	private collapseSignal = 0;
	private readonly listeners = new Set<AppShellListener>();
	private readonly tabNavControllers: Partial<Record<FooterTab, NavigationController>> = {};

	get activeFooterTab(): FooterTab {
		return this.activeTab;
	}

	get nowPlayingCollapseSignal(): number {
		return this.collapseSignal;
	}

	areNavTabsReady(): boolean {
		return (
			this.tabNavControllers[FooterTabs.home] !== undefined &&
			this.tabNavControllers[FooterTabs.library] !== undefined &&
			this.tabNavControllers[FooterTabs.search] !== undefined
		);
	}

	getController(tab: FooterTab): NavigationController | undefined {
		return this.tabNavControllers[tab];
	}

	handleDetailArtistTap = (artistId: string): void => {
		const services = appServices.get();
		if (!services) {
			return;
		}
		services.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist) {
					return;
				}
				this.pushIntoActiveTab((controller, deps) => pushArtist(controller, deps, artist));
			})
			.catch(() => {});
	};

	// A Library section tab tapped from a detail's header: dismiss the detail and land on that section.
	handleDetailSectionTap = (tab: HeaderTab): void => {
		const origin = this.activeTab;
		this.dismissDetail(origin);
		if (origin !== FooterTabs.library) {
			this.dismissDetail(FooterTabs.library);
			this.setActiveTab(FooterTabs.library);
		}
		const descriptor = headerStore.descriptorFor(FooterTabs.library);
		if (descriptor?.kind === 'library') {
			descriptor.onTabTap(tab);
		}
	};

	handleFooterTabTap = (tab: FooterTab): void => {
		// iOS pushes details full-screen onto the one root nav controller, so an open detail covers
		// the tabs; pop the current tab back to its root so the tapped tab is actually revealed.
		// (Android keeps a separate stack per tab, so the target tab already shows on switch.)
		if (!Device.isAndroid()) {
			this.tabNavControllers[this.activeTab]?.popToSelf(false);
		}
		this.setActiveTab(tab);
	};

	handleNowPlayingAlbumTap = (track?: Track): void => {
		const services = appServices.get();
		if (!services) {
			return;
		}
		const { album, track: playing } = services.playbackStore;
		const resolvedAlbum = track
			? this.albumFromTrack(track)
			: (album ?? this.albumFromTrack(playing));
		if (!resolvedAlbum) {
			return;
		}
		this.pushIntoActiveTab((controller, deps) => pushAlbum(controller, deps, resolvedAlbum));
	};

	handleNowPlayingArtistTap = (track?: Track): void => {
		const artist = this.resolveNowPlayingArtist(track);
		if (!artist) {
			return;
		}
		this.pushIntoActiveTab((controller, deps) => pushArtist(controller, deps, artist));
	};

	handleNowPlayingOpenPlaylist = (playlist: Playlist): void => {
		this.pushIntoActiveTab((controller, deps) => pushPlaylist(controller, deps, playlist));
	};

	registerController(tab: FooterTab, controller: NavigationController): void {
		this.tabNavControllers[tab] = controller;
	}

	reset(): void {
		for (const tab of Object.values(FooterTabs)) {
			delete this.tabNavControllers[tab];
		}
		const changed = this.activeTab !== FooterTabs.home || this.collapseSignal !== 0;
		this.activeTab = FooterTabs.home;
		this.collapseSignal = 0;
		if (changed) {
			this.notify();
		}
	}

	setActiveTab(tab: FooterTab): void {
		backNavRouter.setActiveTab(tab);
		if (this.activeTab === tab) {
			return;
		}
		this.activeTab = tab;
		this.notify();
	}

	subscribe(listener: AppShellListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private albumFromTrack(track: Track | null | undefined): Album | null {
		if (!track?.albumId) {
			return null;
		}
		return {
			artistId: track.artistId ?? '',
			artistName: track.artistName ?? '',
			id: track.albumId,
			imageUrl: track.albumImageUrl,
			name: track.albumName ?? '',
			releaseDate: track.releaseDate,
		};
	}

	private detailDeps(): DetailPushDeps | undefined {
		const services = appServices.get();
		if (!services) {
			return undefined;
		}
		return {
			animationsEnabled: services.animationsEnabled,
			downloadService: services.downloadService,
			gridColumns: services.gridColumns,
			imageCache: services.imageCache,
			modalSlot: services.modalSlot,
			onNavigateToArtist: this.handleDetailArtistTap,
			paletteQueue: services.paletteQueue,
			playbackStore: services.playbackStore,
			toastService: services.toastService,
			transport: services.transport,
		};
	}

	private dismissDetail(tab: FooterTab): void {
		// iOS unwinds the tab's whole detail stack via its root controller; Android's JS navigator
		// throws on popToSelf, so pop the tab's first detail (removing it and everything above it).
		if (!Device.isAndroid()) {
			this.tabNavControllers[tab]?.popToSelf(false);
		} else {
			backNavRouter.firstPageOf(tab)?.pop(false);
		}
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			listener();
		}
	}

	// Now-playing details push onto the active tab; Settings has no nav stack, so fall back to Library.
	private pushIntoActiveTab(
		push: (controller: NavigationController, deps: DetailPushDeps) => void,
	): void {
		const deps = this.detailDeps();
		if (!deps) {
			return;
		}
		const controller = this.tabNavControllers[this.activeTab];
		if (controller) {
			push(controller, deps);
			return;
		}
		const libraryController = this.tabNavControllers[FooterTabs.library];
		if (!libraryController) {
			return;
		}
		this.setActiveTab(FooterTabs.library);
		push(libraryController, deps);
	}

	private resolveNowPlayingArtist(track?: Track): Artist | null {
		if (track) {
			if (!track.artistId) {
				return null;
			}
			return { id: track.artistId, name: track.artistName ?? 'Unknown Artist' } as Artist;
		}
		const services = appServices.get();
		if (!services) {
			return null;
		}
		const { album, artistLogoUrl, track: playing } = services.playbackStore;
		const artistId = playing?.artistId ?? album?.artistId;
		if (!artistId) {
			return null;
		}
		return {
			id: artistId,
			logoUrl: artistLogoUrl ?? undefined,
			name: playing?.artistName ?? album?.artistName ?? 'Unknown Artist',
		} as Artist;
	}
}

export const appShellStore = new AppShellStore();
