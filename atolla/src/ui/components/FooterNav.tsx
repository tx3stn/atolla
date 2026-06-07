import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { BarColorStore } from '../../stores/BarColor';
import { theme } from '../../theme';
import { FooterIcon } from './FooterIcon';
import { type FooterTab, FooterTabs } from './FooterTab';

export interface FooterNavViewModel {
	activeTab: FooterTab;
	barColors: BarColorStore;
	downloadingCount: number;
	onFooterTabTap: (tabId: FooterTab) => void;
}

export class FooterNav extends Component<FooterNavViewModel> {
	private rootRef = new ElementRef();

	onCreate(): void {
		this.registerDisposable(
			this.viewModel.barColors.subscribe(() => {
				this.rootRef.setAttribute('backgroundColor', this.viewModel.barColors.footerColor);
			}),
		);
	}

	onRender() {
		<view
			backgroundColor={this.viewModel.barColors.footerColor}
			ref={this.rootRef}
			style={styles.footerPinned}
		>
			<FooterIcon
				accessibilityId='footer-home'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.home);
				})}
				active={this.viewModel.activeTab === FooterTabs.home}
				icon={res.home}
			/>

			<FooterIcon
				accessibilityId='footer-library'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.library);
				})}
				active={this.viewModel.activeTab === FooterTabs.library}
				badgeCount={this.viewModel.downloadingCount}
				icon={res.library}
			/>

			<FooterIcon
				accessibilityId='footer-search'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.search);
				})}
				active={this.viewModel.activeTab === FooterTabs.search}
				icon={res.search}
			/>

			<FooterIcon
				accessibilityId='footer-settings'
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
	footerPinned: new Style<View>({
		bottom: 0,
		flexDirection: 'row',
		height: theme.footerHeight,
		left: 0,
		marginTop: -2,
		padding: 6,
		position: 'absolute',
		right: 0,
		width: '100%',
		zIndex: 60,
	}),
};
