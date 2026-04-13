// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';

interface GenresViewModel {
	playbackStore: PlaybackStore;
}

interface GenresState {
	isFooterVisible: boolean;
}

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

	onRender(): void {
		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
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

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: theme.headerHeight,
		width: '100%',
	});
}
