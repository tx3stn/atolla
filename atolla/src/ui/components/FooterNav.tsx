import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, FooterTabs } from '../../models/App';
import { type BarColorStore, defaultFooterColors, type FooterColors } from '../../stores/BarColor';
import { theme } from '../../theme';
import { FooterIcon } from './FooterIcon';

export interface FooterNavViewModel {
	activeTab: FooterTab;
	barColors: BarColorStore;
	downloadingCount: number;
	onFooterTabTap: (tabId: FooterTab) => void;
}

interface FooterNavState {
	footer: FooterColors;
}

export class FooterNav extends StatefulComponent<FooterNavViewModel, FooterNavState> {
	state: FooterNavState = { footer: defaultFooterColors };

	onCreate(): void {
		this.syncFooter();
		this.registerDisposable(this.viewModel.barColors.subscribe(() => this.syncFooter()));
	}

	private syncFooter(): void {
		this.setState({ footer: this.viewModel.barColors.footer });
	}

	onRender() {
		const { footer } = this.state;
		<view backgroundColor={footer.background} style={styles.footerPinned}>
			<FooterIcon
				accessibilityId='footer-home'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.home);
				})}
				active={this.viewModel.activeTab === FooterTabs.home}
				activeColor={footer.activeIconColor}
				icon={res.home}
				inactiveColor={footer.inactiveIconColor}
			/>

			<FooterIcon
				accessibilityId='footer-library'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.library);
				})}
				active={this.viewModel.activeTab === FooterTabs.library}
				activeColor={footer.activeIconColor}
				badgeCount={this.viewModel.downloadingCount}
				icon={res.library}
				inactiveColor={footer.inactiveIconColor}
			/>

			<FooterIcon
				accessibilityId='footer-search'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.search);
				})}
				active={this.viewModel.activeTab === FooterTabs.search}
				activeColor={footer.activeIconColor}
				icon={res.search}
				inactiveColor={footer.inactiveIconColor}
			/>

			<FooterIcon
				accessibilityId='footer-settings'
				action={createReusableCallback(() => {
					this.viewModel.onFooterTabTap(FooterTabs.settings);
				})}
				active={this.viewModel.activeTab === FooterTabs.settings}
				activeColor={footer.activeIconColor}
				icon={res.settings}
				inactiveColor={footer.inactiveIconColor}
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
