// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { HomeHeaderTab } from './HeaderTab';
import { type HeaderTab, HeaderTabs } from './HeaderTabs';

interface HomeHeaderViewModel {
	activeTab: HeaderTab;
	onTabTap: (tabId: HeaderTab) => void;
}

export class HomeHeaderNav extends Component<HomeHeaderViewModel> {
	onRender() {
		<layout style={styles.homeTabs}>
			<HomeHeaderTab
				active={this.viewModel.activeTab === HeaderTabs.artists}
				onTap={createReusableCallback(() => {
					this.viewModel.onTabTap(HeaderTabs.artists);
				})}
				tab={HeaderTabs.artists}
			/>
			<HomeHeaderTab
				active={this.viewModel.activeTab === HeaderTabs.albums}
				onTap={createReusableCallback(() => {
					this.viewModel.onTabTap(HeaderTabs.albums);
				})}
				tab={HeaderTabs.albums}
			/>
			<HomeHeaderTab
				active={this.viewModel.activeTab === HeaderTabs.playlists}
				onTap={createReusableCallback(() => {
					this.viewModel.onTabTap(HeaderTabs.playlists);
				})}
				tab={HeaderTabs.playlists}
			/>
		</layout>;
	}
}

const styles = {
	homeTabs: new Style({
		columnGap: 1,
		flexDirection: 'row',
		marginBottom: 2,
		marginTop: 8,
		width: '100%',
	}),
};
