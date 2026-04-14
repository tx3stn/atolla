// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { theme } from '../../theme';
import { FooterIcon } from './FooterIcon';
import { type FooterTab, FooterTabs } from './FooterTab';

export interface FooterNavViewModel {
	activeTab: FooterTab;
	onFooterTabTap: (tabId: FooterTab) => void;
}

export class FooterNav extends Component<FooterNavViewModel> {
	onRender() {
		<view style={styles.footerPinned}>
			<FooterIcon
				accessibilityLabel='footer-home'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.home);
				})}
				active={this.viewModel.activeTab === FooterTabs.home}
				icon={res.home}
			/>

			<FooterIcon
				accessibilityLabel='footer-library'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.library);
				})}
				active={this.viewModel.activeTab === FooterTabs.library}
				icon={res.library}
			/>

			<FooterIcon
				accessibilityLabel='footer-search'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.search);
				})}
				active={this.viewModel.activeTab === FooterTabs.search}
				icon={res.search}
			/>

			<FooterIcon
				accessibilityLabel='footer-settings'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.settings);
				})}
				active={this.viewModel.activeTab === FooterTabs.settings}
				icon={res.settings}
			/>
		</view>;
	}
}

const styles = {
	footerPinned: new Style({
		backgroundColor: theme.colors.bgFrosted,
		bottom: 0,
		flexDirection: 'row',
		left: 0,
		marginTop: -2,
		padding: 6,
		paddingTop: 10,
		position: 'absolute',
		right: 0,
		width: '100%',
		zIndex: 60,
	}),
};
