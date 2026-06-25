import { StatefulComponent } from 'valdi_core/src/Component';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { type FooterTab, FooterTabs } from './models/App';
import type { BarColorStore } from './stores/BarColor';
import { theme } from './theme';
import { FooterNav } from './ui/components/FooterNav';

export interface AuthedAppViewModel {
	barColors: BarColorStore;
	downloadingCount: number;
	modalSlot: DetachedSlot;
	toastSlot: DetachedSlot;
}

export interface AuthedAppState {
	activeFooterTab: FooterTab;
}

export class AuthedApp extends StatefulComponent<AuthedAppViewModel, AuthedAppState> {
	state: AuthedAppState = { activeFooterTab: FooterTabs.home };

	private handleFooterTabTap = (tab: FooterTab): void => {
		this.setState({ activeFooterTab: tab });
	};

	onRender(): void {
		<view style={theme.app.root}>
			<view style={theme.app.content}>
				{/* Actual body content - home, library, search, settings */}
			</view>

			<FooterNav
				activeTab={this.state.activeFooterTab}
				barColors={this.viewModel.barColors}
				downloadingCount={this.viewModel.downloadingCount}
				onFooterTabTap={this.handleFooterTabTap}
			/>

			<DetachedSlotRenderer detachedSlot={this.viewModel.modalSlot} />
			<DetachedSlotRenderer detachedSlot={this.viewModel.toastSlot} />
		</view>;
	}
}
