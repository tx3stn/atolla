import type { PlaybackStore } from '../../stores/Playback';

interface FooterVisibilityBindingArgs {
	getIsFooterVisible: () => boolean;
	playbackStore: PlaybackStore;
	setIsFooterVisible: (isFooterVisible: boolean) => void;
}

export function bindFooterVisibility(args: FooterVisibilityBindingArgs): () => void {
	const syncVisibility = (): void => {
		const isFooterVisible = args.playbackStore.track !== null;
		if (isFooterVisible !== args.getIsFooterVisible()) {
			args.setIsFooterVisible(isFooterVisible);
		}
	};

	const unsubscribe = args.playbackStore.subscribe(syncVisibility);
	syncVisibility();
	return unsubscribe;
}
