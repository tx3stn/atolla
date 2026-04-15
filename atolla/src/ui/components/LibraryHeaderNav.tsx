// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { ConnectivityFab } from './ConnectivityFab';
import { LibraryHeaderTab } from './HeaderTab';
import { type HeaderTab, HeaderTabs } from './HeaderTabs';

interface LibraryHeaderViewModel {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onTabTap: (tabId: HeaderTab) => void;
}

export class LibraryHeaderNav extends StatefulComponent<
	LibraryHeaderViewModel,
	Record<string, never>
> {
	private rootRef = new ElementRef();
	private readonly hiddenTop = -(theme.headerHeight + 16);

	onCreate(): void {
		if (!this.viewModel.animationsEnabled) {
			this.rootRef.setAttribute('top', 0);
			this.rootRef.setAttribute('opacity', 1);
			return;
		}

		this.rootRef.setAttribute('top', this.hiddenTop);
		this.rootRef.setAttribute('opacity', 0.88);

		Promise.resolve().then(() => {
			this.animatePromise({ damping: 26, stiffness: 400 }, () => {
				this.rootRef.setAttribute('top', 1);
				this.rootRef.setAttribute('opacity', 1);
			}).then(() => {
				this.animatePromise({ damping: 30, stiffness: 420 }, () => {
					this.rootRef.setAttribute('top', 0);
				});
			});
		});
	}

	onRender() {
		<view
			accessibilityLabel='library-header-nav'
			contentDescription='library-header-nav'
			ref={this.rootRef}
			style={styles.libraryTabs}
		>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					connectionMode={this.viewModel.connectionMode}
					downloadingCount={this.viewModel.downloadingCount}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>
			<view style={styles.scrollViewport}>
				<scroll horizontal={true} showsHorizontalScrollIndicator={false} style={styles.scroll}>
					<view style={styles.tabsRow}>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.artists}
							onTap={createReusableCallback(() => {
								this.viewModel.onTabTap(HeaderTabs.artists);
							})}
							tab={HeaderTabs.artists}
						/>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.albums}
							onTap={createReusableCallback(() => {
								this.viewModel.onTabTap(HeaderTabs.albums);
							})}
							tab={HeaderTabs.albums}
						/>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.playlists}
							onTap={createReusableCallback(() => {
								this.viewModel.onTabTap(HeaderTabs.playlists);
							})}
							tab={HeaderTabs.playlists}
						/>
						<LibraryHeaderTab
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
	lastTabWrap: new Style({}),
	leadingFabSlot: new Style({
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingLeft: 6,
		paddingRight: 6,
		width: 60,
	}),
	libraryTabs: new Style({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	scroll: new Style({
		flex: 1,
		paddingTop: 4,
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
