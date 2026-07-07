import { StatefulComponent } from 'valdi_core/src/Component';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { AppServicesBag } from '../../services/AppServices';
import { appServices } from '../../services/AppServices';
import { appShellStore } from '../../stores/AppShell';
import { AppHeader } from '../components/AppHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Floating } from '../components/Floating';
import { FooterNav } from '../components/FooterNav';
import { NowPlayingSurface } from '../components/NowPlayingSurface';

export interface OverlayHostState {
	revision: number;
}

export class OverlayHost extends StatefulComponent<Record<string, never>, OverlayHostState> {
	state: OverlayHostState = { revision: 0 };

	private playbackSubscribed = false;
	private preferencesSubscribed = false;
	private overlayContentSubscribed = false;
	private lastPlaybackSignature = '';

	onCreate(): void {
		this.registerDisposable(appServices.subscribe(this.handleChange));
		this.registerDisposable(appShellStore.subscribe(this.handleChange));
		this.ensurePlaybackSubscription();
		this.ensurePreferencesSubscription();
		this.ensureOverlayContentSubscription();
	}

	onRender(): void {
		const services = appServices.get();
		if (!services) {
			return;
		}
		// Floating hoists the bars into a window-level pass-through layer (a bare <slot/> on Android). On
		// iOS this OverlayHost is a standalone always-on-top root, so the layer is driven by a root that
		// never detaches — the freeze fix — while keeping Floating's proven touch passthrough.
		<Floating>{this.overlayBars(services)}</Floating>;
	}

	// The iOS overlay root mounts before login, when appServices isn't ready, so the playbackStore
	// subscription can't be taken in onCreate. Subscribe lazily the first time services appear.
	private ensurePlaybackSubscription(): void {
		if (this.playbackSubscribed) {
			return;
		}
		const services = appServices.get();
		if (!services) {
			return;
		}
		this.playbackSubscribed = true;
		this.registerDisposable(services.playbackStore.subscribe(this.handlePlaybackChange));
	}

	private ensurePreferencesSubscription(): void {
		if (this.preferencesSubscribed) {
			return;
		}
		const services = appServices.get();
		if (!services) {
			return;
		}
		this.preferencesSubscribed = true;
		this.registerDisposable(services.preferences.subscribe(this.handleChange));
	}

	// palette (bar colours) and waveform masks resolve asynchronously; subscribe so the overlay picks
	// them up when they land rather than only on the next playback-state change (e.g. skipping tracks)
	private ensureOverlayContentSubscription(): void {
		if (this.overlayContentSubscribed) {
			return;
		}
		const services = appServices.get();
		if (!services) {
			return;
		}
		this.overlayContentSubscribed = true;
		this.registerDisposable(services.paletteService.subscribe(this.handleChange));
		this.registerDisposable(
			services.playbackOrchestrator.subscribeOverlayContent(this.handleChange),
		);
	}

	private handleChange = (): void => {
		this.ensurePlaybackSubscription();
		this.ensurePreferencesSubscription();
		this.ensureOverlayContentSubscription();
		this.setState({ revision: this.state.revision + 1 });
	};

	// the overlay renders the header/now-playing/footer, none of which show elapsed time (the surface
	// tracks progress via its own subscription). re-rendering the whole overlay on every progress
	// notify (~5x/s) needlessly re-requests artwork and re-creates native callback bindings, so
	// collapse progress-only notifications: re-render only when a displayed field changes
	private handlePlaybackChange = (): void => {
		const services = appServices.get();
		if (!services) {
			return;
		}
		const { track, album, isPlaying, loopMode, trackIndex, tracks, artistLogoUrl } =
			services.playbackStore;
		const signature = `${track?.id ?? ''}|${album?.id ?? ''}|${isPlaying}|${loopMode}|${trackIndex}|${tracks.length}|${artistLogoUrl ?? ''}`;
		if (signature === this.lastPlaybackSignature) {
			return;
		}
		this.lastPlaybackSignature = signature;
		this.setState({ revision: this.state.revision + 1 });
	};

	private overlayBars(services: AppServicesBag): void {
		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			services.playbackStore;
		const palette = services.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);

		<AppHeader
			activeFooterTab={appShellStore.activeFooterTab}
			animationsEnabled={services.preferences.animationsEnabled}
			connectionMode={services.connectionMode}
			onDetailSectionTap={appShellStore.handleDetailSectionTap}
			onRequestModeChange={services.onRequestModeChange}
		/>;
		if (track) {
			<ErrorBoundary resetKey={track.id}>
				<NowPlayingSurface
					album={album}
					animationsEnabled={services.preferences.animationsEnabled}
					artistLogoUrl={artistLogoUrl}
					barColors={services.barColors}
					collapseSignal={appShellStore.nowPlayingCollapseSignal}
					gridColumns={services.preferences.gridColumns}
					imageCache={services.imageCache}
					isPlaying={isPlaying}
					language={services.preferences.language}
					loopMode={loopMode}
					modalSlot={services.modalSlot}
					onAlbumTap={appShellStore.handleNowPlayingAlbumTap}
					onArtistTap={appShellStore.handleNowPlayingArtistTap}
					onOpenPlaylist={appShellStore.handleNowPlayingOpenPlaylist}
					palette={palette}
					playbackStore={services.playbackStore}
					toastService={services.toastService}
					track={track}
					trackIndex={trackIndex}
					tracks={tracks}
					transport={services.transport}
					waveformMaskUrl={services.playbackOrchestrator.getWaveformMaskUrl(track.id)}
				/>
			</ErrorBoundary>;
		}
		<FooterNav
			activeTab={appShellStore.activeFooterTab}
			barColors={services.barColors}
			downloadingCount={services.downloadingCount}
			onFooterTabTap={appShellStore.handleFooterTabTap}
		/>;
		<DetachedSlotRenderer detachedSlot={services.modalSlot} />;
		<DetachedSlotRenderer detachedSlot={services.toastSlot} />;
	}
}
