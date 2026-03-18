// @ts-nocheck
import res from 'atolla/res';
import type { Preferences } from 'atolla/src/stores/Preferences';
import {
	type ConnectionMode,
	ConnectionModes,
	cycleConnectionMode,
} from 'atolla/src/transports/Model';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { theme } from '../../theme';
import { FooterIcon } from './FooterIcon';
import { type FooterTab, FooterTabs } from './FooterTab';

export interface FooterNavViewModel {
	activeTab: FooterTab;
	onFooterTabTap: (tabId: FooterTab) => void;
	preferences: Preferences;
}

interface FooterNavState {
	connectionMode: ConnectionMode;
}

export class FooterNav extends StatefulComponent<FooterNavViewModel, FooterNavState> {
	state: FooterNavState = {
		connectionMode: ConnectionModes.mock,
	};

	async onCreate() {
		const connectionMode = await this.viewModel.preferences.getMode();
		this.setState({ connectionMode });
	}

	private async onModeBadgeTap() {
		const newMode = cycleConnectionMode(this.state.connectionMode);
		await this.viewModel.preferences.setMode(newMode);
		this.setState({ connectionMode: newMode });
	}

	onRender() {
		const modeIcon = modeIcons(this.state.connectionMode);

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
			return res.mocked;
		}
		case ConnectionModes.offline: {
			return res.wifioff;
		}
		case ConnectionModes.online: {
			return res.wifi;
		}
	}
};

const styles = {
	footerPinned: new Style({
		backgroundColor: theme.colors.bg,
		borderRadius: 12,
		bottom: 0,
		flexDirection: 'row',
		left: 0,
		marginTop: -2,
		padding: 6,
		paddingTop: 10,
		position: 'absolute',
		right: 0,
		width: '100%',
		zIndex: 20,
	}),
};
