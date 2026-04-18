// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import type { PlaybackStore } from '../../stores/Playback';
import { VideoAudioPlayer } from './VideoAudioPlayer';

export interface GaplessPlayerViewModel {
	activeSourceUrl: string | null;
	nextSourceUrl: string | null;
	onPlaybackError?: (error: string) => void;
	onPlaybackEvent?: (event: string) => void;
	onTrackCompleted?: () => void;
	playbackStore: PlaybackStore;
}

interface GaplessPlayerState {
	activeSlot: 'A' | 'B';
	inactivePreRolling: boolean;
	slotAUrl: string | null;
	slotBUrl: string | null;
}

export class GaplessPlayer extends StatefulComponent<GaplessPlayerViewModel, GaplessPlayerState> {
	state: GaplessPlayerState = {
		activeSlot: 'A',
		inactivePreRolling: false,
		slotAUrl: null,
		slotBUrl: null,
	};

	// Set when a track completes; cleared when onViewModelUpdate confirms the new activeSourceUrl.
	// Deferring the slot flip here prevents the race where the slot flips before App.tsx has
	// updated activeSourceUrl, which would cause onViewModelUpdate to overwrite the pre-loaded slot.
	private handoffPendingSlot: 'A' | 'B' | null = null;

	onCreate(): void {
		this.setState({
			slotAUrl: this.viewModel.activeSourceUrl,
			slotBUrl: this.viewModel.nextSourceUrl,
		});
	}

	onViewModelUpdate(): void {
		const { activeSourceUrl, nextSourceUrl } = this.viewModel;
		const isSlotAActive = this.state.activeSlot === 'A';
		const currentActiveUrl = isSlotAActive ? this.state.slotAUrl : this.state.slotBUrl;
		const currentInactiveUrl = isSlotAActive ? this.state.slotBUrl : this.state.slotAUrl;

		const activeUrlChanged = activeSourceUrl !== currentActiveUrl;
		const inactiveUrlChanged = nextSourceUrl !== currentInactiveUrl;

		if (!activeUrlChanged && !inactiveUrlChanged) {
			return;
		}

		const updates: Partial<GaplessPlayerState> = {};

		if (activeUrlChanged) {
			if (this.handoffPendingSlot !== null) {
				// App.tsx has confirmed the new active track — complete the handoff now.
				const nextSlot = this.handoffPendingSlot;
				this.handoffPendingSlot = null;
				updates.activeSlot = nextSlot;
				updates.inactivePreRolling = false;
				// The pre-loaded slot already has the right URL in most cases. Only overwrite
				// if the URL changed between pre-load time and handoff (e.g. native cache ready).
				const preloadedUrl = nextSlot === 'A' ? this.state.slotAUrl : this.state.slotBUrl;
				if (activeSourceUrl !== preloadedUrl) {
					if (nextSlot === 'A') {
						updates.slotAUrl = activeSourceUrl;
					} else {
						updates.slotBUrl = activeSourceUrl;
					}
				}
			} else {
				// User skip or new track — update the active slot URL directly.
				if (isSlotAActive) {
					updates.slotAUrl = activeSourceUrl;
				} else {
					updates.slotBUrl = activeSourceUrl;
				}
				updates.inactivePreRolling = false;
			}
		}

		if (inactiveUrlChanged) {
			// If a slot flip is happening in this same update, use the post-flip active slot
			// to determine which slot is now inactive.
			const effectiveSlotAActive = updates.activeSlot ? updates.activeSlot === 'A' : isSlotAActive;
			if (effectiveSlotAActive) {
				updates.slotBUrl = nextSourceUrl;
			} else {
				updates.slotAUrl = nextSourceUrl;
			}
		}

		this.setState(updates as GaplessPlayerState);
	}

	onRender(): void {
		const { onPlaybackError, onPlaybackEvent, playbackStore } = this.viewModel;
		const { activeSlot, inactivePreRolling, slotAUrl, slotBUrl } = this.state;
		const slotAActive = activeSlot === 'A';

		<VideoAudioPlayer
			isActive={slotAActive}
			isPreRolling={!slotAActive && inactivePreRolling}
			onNearingEnd={slotAActive ? this.handleNearingEnd : undefined}
			onPlaybackError={onPlaybackError}
			onPlaybackEvent={onPlaybackEvent}
			onTrackCompleted={slotAActive ? this.handleGaplessHandoff : undefined}
			playbackSourceUrl={slotAUrl}
			playbackStore={playbackStore}
			volume={!slotAActive && inactivePreRolling ? 0 : undefined}
		/>;
		<VideoAudioPlayer
			isActive={!slotAActive}
			isPreRolling={slotAActive && inactivePreRolling}
			onNearingEnd={!slotAActive ? this.handleNearingEnd : undefined}
			onPlaybackError={onPlaybackError}
			onPlaybackEvent={onPlaybackEvent}
			onTrackCompleted={!slotAActive ? this.handleGaplessHandoff : undefined}
			playbackSourceUrl={slotBUrl}
			playbackStore={playbackStore}
			volume={slotAActive && inactivePreRolling ? 0 : undefined}
		/>;
	}

	private handleNearingEnd = (): void => {
		if (!this.state.inactivePreRolling) {
			this.setState({ inactivePreRolling: true });
		}
	};

	private handleGaplessHandoff = (): void => {
		const store = this.viewModel.playbackStore;

		// Loop-track: the store re-seeks the same track instead of advancing; no slot flip needed.
		if (store.loopMode !== 'track') {
			const hasNextTrack = store.trackIndex < store.tracks.length - 1 || store.loopMode === 'queue';
			if (hasNextTrack) {
				// Record the desired next slot. The actual flip happens in onViewModelUpdate once
				// App.tsx updates activeSourceUrl to the new track, avoiding the race where the
				// slot flips before App.tsx knows which URL the new active track should have.
				this.handoffPendingSlot = this.state.activeSlot === 'A' ? 'B' : 'A';
			}
		}

		this.viewModel.onTrackCompleted?.();
	};
}
