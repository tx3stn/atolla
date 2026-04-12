// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import { createHeaderVisibilityTouchHandler } from '../animations/Header';

interface GenresViewModel {
	isHeaderVisible: boolean;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	playbackStore: PlaybackStore;
}

interface GenresState {
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
}

export class GenresView extends StatefulComponent<GenresViewModel, GenresState> {
	private unsubscribePlayback?: () => void;
	private readonly setHeaderVisibility = (isVisible: boolean): void => {
		if (this.state.isHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHeaderVisible: isVisible });
		this.viewModel.onHeaderVisibilityChange?.(isVisible);
	};
	private readonly handleScrollDrag = createHeaderVisibilityTouchHandler({
		getIsHeaderVisible: () => this.state.isHeaderVisible,
		onHeaderVisibilityChange: this.setHeaderVisibility,
	});

	state: GenresState = {
		isFooterVisible: false,
		isHeaderVisible: true,
	};

	onCreate(): void {
		if (this.state.isHeaderVisible !== this.viewModel.isHeaderVisible) {
			this.setState({ isHeaderVisible: this.viewModel.isHeaderVisible });
		}

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

	onViewModelUpdate(prevViewModel?: GenresViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.isHeaderVisible !== prevViewModel.isHeaderVisible &&
			this.viewModel.isHeaderVisible !== this.state.isHeaderVisible
		) {
			this.setState({ isHeaderVisible: this.viewModel.isHeaderVisible });
		}
	}

	onDestroy(): void {
		this.unsubscribePlayback?.();
	}

	onRender(): void {
		// biome-ignore lint/a11y/noStaticElementInteractions: Scroll drag drives header hide/show.
		<scroll
			onDrag={createReusableCallback((event) => {
				this.handleScrollDrag(event);
			})}
			onDragPredicate={(event) => Math.abs(event.deltaY) > Math.abs(event.deltaX)}
			style={createScrollStyle(this.state.isFooterVisible, this.state.isHeaderVisible)}
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
