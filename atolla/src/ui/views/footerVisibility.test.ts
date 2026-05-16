import { describe, expect, it } from 'bun:test';
import type { PlaybackStore } from '../../stores/Playback';
import { bindFooterVisibility } from './footerVisibility';

interface MockPlaybackStore {
	subscribe: (listener: () => void) => () => void;
	track: unknown;
}

describe('bindFooterVisibility', () => {
	it('syncs initial footer visibility', () => {
		let isFooterVisible = false;
		const store = createPlaybackStore({ track: { id: 'track' } });

		const unsubscribe = bindFooterVisibility({
			getIsFooterVisible: () => isFooterVisible,
			playbackStore: store as unknown as PlaybackStore,
			setIsFooterVisible: (value) => {
				isFooterVisible = value;
			},
		});

		expect(isFooterVisible).toBe(true);
		unsubscribe();
	});

	it('updates footer visibility when playback changes', () => {
		let isFooterVisible = false;
		const store = createPlaybackStore({ track: null });

		const unsubscribe = bindFooterVisibility({
			getIsFooterVisible: () => isFooterVisible,
			playbackStore: store as unknown as PlaybackStore,
			setIsFooterVisible: (value) => {
				isFooterVisible = value;
			},
		});

		expect(isFooterVisible).toBe(false);
		store.track = { id: 'track' };
		store.emit();
		expect(isFooterVisible).toBe(true);
		store.track = null;
		store.emit();
		expect(isFooterVisible).toBe(false);
		unsubscribe();
	});

	it('returns unsubscribe from playback store', () => {
		let unsubscribed = false;
		const store = createPlaybackStore({
			onUnsubscribe: () => {
				unsubscribed = true;
			},
			track: null,
		});

		const unsubscribe = bindFooterVisibility({
			getIsFooterVisible: () => false,
			playbackStore: store as unknown as PlaybackStore,
			setIsFooterVisible: () => {},
		});

		unsubscribe();
		expect(unsubscribed).toBe(true);
	});
});

function createPlaybackStore(args: {
	onUnsubscribe?: () => void;
	track: unknown;
}): MockPlaybackStore & { emit: () => void } {
	let listener: (() => void) | null = null;

	return {
		emit: () => {
			listener?.();
		},
		subscribe: (nextListener) => {
			listener = nextListener;
			return () => {
				listener = null;
				args.onUnsubscribe?.();
			};
		},
		track: args.track,
	};
}
