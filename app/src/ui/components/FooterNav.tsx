// @ts-nocheck
import res from 'app/res';
import type { Preferences } from 'app/src/stores/Preferences';
import {
	type ConnectionMode,
	ConnectionModes,
	cycleConnectionMode,
} from 'app/src/transports/model';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { FooterIcon } from './FooterIcon';
import { type FooterTab, FooterTabs } from './FooterTab';

export interface FooterNavViewModel {
	activeTab: FooterTab;
	onFooterTabTap: (tabId: FooterTab) => void;
	onModeBadgeTap: () => void;
	preferences: Preferences;
}

export class FooterNav extends Component<FooterNavViewModel> {
	private onModeBadgeTap() {
		const newMode = cycleConnectionMode(this.viewModels.preferences.getMode());
		this.viewModels.preferences.setMode(newMode);
	}

	async onRender() {
		const modeIcon = modeIcons(await this.viewModel.preferences.getMode());

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
			<FooterIcon
				accessibilityLabel='footer-mode'
				action={createReusableCallback(() => {
					this.onModeBadgeTap();
				})}
				icon={modeIcon}
			/>
		</view>;
	}
}

const modeIcons = (mode: ConnectionMode) => {
	switch (mode) {
		case ConnectionModes.mock: {
			return res.mock;
		}
		case ConnectionModes.offline: {
			return res.wifiOff;
		}
		case ConnectionModes.online: {
			return res.wifi;
		}
	}
};

const styles = {
	footerPinned: new Style({
		borderRadius: 12,
		columnGap: 8,
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: -2,
		padding: 6,
		paddingTop: 10,
		width: '100%',
	}),
};
