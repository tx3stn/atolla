// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { MockTransport } from '../../transports/Mock';
import { type HeaderTab, HeaderTabs } from '../components/HeaderTabs';
import { HomeHeaderNav } from '../components/HomeHeaderNav';
import { ArtistsView } from './ArtistsView';

export type HomeViewModel = Record<string, never>;

interface HomeState {
	activeTab: HeaderTab;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private transport = new MockTransport();

	state: HomeState = {
		activeTab: HeaderTabs.artists,
	};

	handleHeaderTabTap = (tab: HeaderTab): void => {
		this.setState({ activeTab: tab });
	};

	onRender(): void {
		<view style={styles.root}>
			<HomeHeaderNav activeTab={this.state.activeTab} onTabTap={this.handleHeaderTabTap} />

			{this.state.activeTab === HeaderTabs.artists && <ArtistsView transport={this.transport} />}
			{/* {this.state.activeTab === HeaderTabs.albums && <AlbumsView transport={this.transport} />} */}
			{/* {this.state.activeTab === HeaderTabs.playlists && <PlaylistsView transport={this.transport} />} */}
		</view>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
};
