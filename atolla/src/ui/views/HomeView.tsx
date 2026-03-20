// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { PlaybackStore } from '../../stores/Playback';
import { MockTransport } from '../../transports/Mock';
import { type HeaderTab, HeaderTabs } from '../components/HeaderTabs';
import { HomeHeaderNav } from '../components/HomeHeaderNav';
import { AlbumsView } from './AlbumsView';
import { ArtistsView } from './ArtistsView';
import { PlaylistsView } from './PlaylistsView';

export interface HomeViewModel {
	playbackStore: PlaybackStore;
}

interface HomeState {
	activeTab: HeaderTab;
	tabKeys: Record<HeaderTab, number>;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private transport = new MockTransport();

	state: HomeState = {
		activeTab: HeaderTabs.artists,
		tabKeys: {
			[HeaderTabs.artists]: 0,
			[HeaderTabs.albums]: 0,
			[HeaderTabs.playlists]: 0,
		},
	};

	handleHeaderTabTap = (tab: HeaderTab): void => {
		if (tab === this.state.activeTab) {
			this.setState({ tabKeys: { ...this.state.tabKeys, [tab]: this.state.tabKeys[tab] + 1 } });
		} else {
			this.setState({ activeTab: tab });
		}
	};

	onRender(): void {
		const { playbackStore } = this.viewModel;

		<view style={styles.root}>
			<HomeHeaderNav activeTab={this.state.activeTab} onTabTap={this.handleHeaderTabTap} />

			{this.state.activeTab === HeaderTabs.artists && (
				<ArtistsView
					key={this.state.tabKeys[HeaderTabs.artists]}
					playbackStore={playbackStore}
					transport={this.transport}
				/>
			)}
			{this.state.activeTab === HeaderTabs.albums && (
				<AlbumsView
					key={this.state.tabKeys[HeaderTabs.albums]}
					playbackStore={playbackStore}
					transport={this.transport}
				/>
			)}
			{this.state.activeTab === HeaderTabs.playlists && (
				<PlaylistsView key={this.state.tabKeys[HeaderTabs.playlists]} transport={this.transport} />
			)}
		</view>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
};
