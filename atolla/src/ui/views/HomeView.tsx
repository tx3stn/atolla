// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { type HeaderTab, HeaderTabs } from '../components/HeaderTabs';
import { HomeHeaderNav } from '../components/HomeHeaderNav';

export type HomeViewModel = Record<string, never>;

interface HomeState {
	activeTab: HeaderTab;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	state: HomeState = {
		activeTab: HeaderTabs.artists,
	};

	handleHeaderTabTap = (tab: HeaderTab): void => {
		this.setState({ activeTab: tab });
	};

	onRender(): void {
		<view style={styles.root}>
			<HomeHeaderNav activeTab={this.state.activeTab} onTabTap={this.handleHeaderTabTap} />

			{/* {this.state.activeTab === HeaderTabs.artists && <ArtistsView />} */}
			{/* {this.state.activeTab === HeaderTabs.albums && <AlbumsView />} */}
			{/* {this.state.activeTab === HeaderTabs.playlists && <PlaylistsView />} */}
		</view>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
};
