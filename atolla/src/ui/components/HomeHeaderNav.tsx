// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { ConnectivityFab } from './ConnectivityFab';
import { HomeHeaderTab } from './HeaderTab';
import { type HeaderTab, HeaderTabs } from './HeaderTabs';

interface HomeHeaderViewModel {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onTabTap: (tabId: HeaderTab) => void;
}

export class HomeHeaderNav extends Component<HomeHeaderViewModel> {
	onRender() {
		<view
			accessibilityLabel='home-header-nav'
			contentDescription='home-header-nav'
			style={styles.homeTabs}
		>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					animationsEnabled={this.viewModel.animationsEnabled}
					connectionMode={this.viewModel.connectionMode}
					downloadingCount={this.viewModel.downloadingCount}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>
			<view style={styles.scrollViewport}>
				<scroll horizontal={true} showsHorizontalScrollIndicator={false} style={styles.scroll}>
					<view style={styles.tabsRow}>
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
						<HomeHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.genres}
							onTap={createReusableCallback(() => {
								this.viewModel.onTabTap(HeaderTabs.genres);
							})}
							tab={HeaderTabs.genres}
						/>
						<view style={styles.trailingSpacer} />
					</view>
				</scroll>
			</view>
			<view style={styles.scrollHintWrap}>
				<label style={styles.scrollHint} value='>' />
			</view>
		</view>;
	}
}

const styles = {
	homeTabs: new Style({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		paddingTop: 4,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	lastTabWrap: new Style({}),
	leadingFabSlot: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		paddingLeft: 6,
		paddingRight: 6,
		width: 58,
	}),
	scroll: new Style({
		flex: 1,
	}),
	scrollHint: new Style({
		...theme.text.mainBold,
		color: theme.colors.grey,
	}),
	scrollHintWrap: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		justifyContent: 'center',
		paddingLeft: 6,
		paddingRight: 10,
	}),
	scrollViewport: new Style({
		flex: 1,
		minWidth: 0,
		overflow: 'hidden',
	}),
	tabsRow: new Style({
		flexDirection: 'row',
		flexShrink: 0,
		paddingLeft: 8,
		paddingRight: 6,
	}),
	trailingSpacer: new Style({
		width: 65,
	}),
};
