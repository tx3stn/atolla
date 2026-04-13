// @ts-nocheck
import res from 'atolla/res';
import {
	type ConnectionMode,
	ConnectionModes,
	cycleConnectionMode,
} from 'atolla/src/transports/Model';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { FooterIcon } from './FooterIcon';
import { type FooterTab, FooterTabs } from './FooterTab';

export interface FooterNavViewModel {
	activeTab: FooterTab;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	onFooterTabTap: (tabId: FooterTab) => void;
	onModeChange: (mode: ConnectionMode) => void;
}

export class FooterNav extends Component<FooterNavViewModel> {
	private onModeBadgeTap = () => {
		this.viewModel.onModeChange(cycleConnectionMode(this.viewModel.connectionMode));
	};

	onRender() {
		const { connectionMode, downloadingCount } = this.viewModel;
		const modeIcon = modeIcons(connectionMode);

		<view style={styles.footerPinned}>
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
			<view
				accessibilityLabel='footer-mode'
				contentDescription='footer-mode'
				onTap={createReusableCallback(() => {
					this.onModeBadgeTap();
				})}
				style={styles.modeIconWrapper}
			>
				<image src={modeIcon} style={styles.modeIcon} tint={theme.colors.grey} />
				{downloadingCount > 0 && (
					<view style={styles.badge}>
						<label style={styles.badgeLabel} value={String(downloadingCount)} />
					</view>
				)}
			</view>
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
	badge: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: 999,
		justifyContent: 'center',
		minWidth: 25,
		padding: 4,
		position: 'absolute',
		right: 2,
		top: 5,
	}),
	badgeLabel: new Style<Label>({
		...theme.text.sub,
		alignItems: 'center',
		color: theme.colors.white,
		justifyContent: 'center',
	}),
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
	modeIcon: new Style({
		height: 20,
		width: 20,
	}),
	modeIconWrapper: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		overflow: 'visible',
		paddingBottom: 10,
		paddingLeft: 0,
		paddingRight: 0,
		paddingTop: 5,
		position: 'relative',
	}),
};
