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

	onCreate(): void {
		this.registerDisposable(appServices.subscribe(this.handleChange));
		this.registerDisposable(appShellStore.subscribe(this.handleChange));
		this.ensurePlaybackSubscription();
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
		this.registerDisposable(services.playbackStore.subscribe(this.handleChange));
	}

	private handleChange = (): void => {
		this.ensurePlaybackSubscription();
		this.setState({ revision: this.state.revision + 1 });
	};

	private overlayBars(services: AppServicesBag): void {
		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			services.playbackStore;
		const palette = services.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);

		<AppHeader
			activeFooterTab={appShellStore.activeFooterTab}
			animationsEnabled={services.animationsEnabled}
			connectionMode={services.connectionMode}
			onDetailSectionTap={appShellStore.handleDetailSectionTap}
			onRequestModeChange={services.onRequestModeChange}
		/>;
		if (track) {
			<ErrorBoundary resetKey={track.id}>
				<NowPlayingSurface
					album={album}
					animationsEnabled={services.animationsEnabled}
					artistLogoUrl={artistLogoUrl}
					barColors={services.barColors}
					collapseSignal={appShellStore.nowPlayingCollapseSignal}
					gridColumns={services.gridColumns}
					imageCache={services.imageCache}
					isPlaying={isPlaying}
					language={services.language}
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
