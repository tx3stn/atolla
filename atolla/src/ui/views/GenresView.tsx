// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';

interface GenresViewModel {
	isHeaderVisible: boolean;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	playbackStore: PlaybackStore;
}

interface GenresState {
	isFooterVisible: boolean;
}

const TouchEventState = { Changed: 1 } as const;

export class GenresView extends StatefulComponent<GenresViewModel, GenresState> {
	private unsubscribePlayback?: () => void;

	state: GenresState = {
		isFooterVisible: false,
	};

	onCreate(): void {
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			const isFooterVisible = this.viewModel.playbackStore.track !== null;
			if (isFooterVisible !== this.state.isFooterVisible) {
				this.setState({ isFooterVisible });
			}
		});

		const isFooterVisible = this.viewModel.playbackStore.track !== null;
		if (isFooterVisible !== this.state.isFooterVisible) {
			this.setState({ isFooterVisible });
		}
	}

	onDestroy(): void {
		this.unsubscribePlayback?.();
	}

	handleScrollTouch = (event): void => {
		if (!this.viewModel.onHeaderVisibilityChange || event.state !== TouchEventState.Changed) {
			return;
		}

		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}

		if (event.deltaY <= -18 && this.viewModel.isHeaderVisible) {
			this.viewModel.onHeaderVisibilityChange(false);
			return;
		}

		if (event.deltaY >= 12 && !this.viewModel.isHeaderVisible) {
			this.viewModel.onHeaderVisibilityChange(true);
		}
	};

	onRender(): void {
		// biome-ignore lint/a11y/noStaticElementInteractions: Scroll drag drives header hide/show.
		<scroll
			onDrag={createReusableCallback((event) => {
				this.handleScrollTouch(event);
			})}
			onDragPredicate={(event) => Math.abs(event.deltaY) > Math.abs(event.deltaX)}
			style={createScrollStyle(this.state.isFooterVisible, this.viewModel.isHeaderVisible)}
		>
			<view style={styles.content}>
				<label style={styles.title} value='Genres' />
				<label style={styles.subtitle} value='Coming soon.' />
			</view>
		</scroll>;
	}
}

const styles = {
	content: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 260,
		paddingTop: 32,
		width: '100%',
	}),
	subtitle: new Style<Label>({
		...theme.text.subLarger,
	}),
	title: new Style<Label>({
		...theme.text.title,
		color: theme.colors.grey,
		marginBottom: 8,
	}),
};

function createScrollStyle(isFooterVisible: boolean, isHeaderVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: isHeaderVisible ? theme.headerHeight : 8,
		width: '100%',
	});
}
