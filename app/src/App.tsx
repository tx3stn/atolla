// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';

export type AppViewModel = Record<string, never>;

interface AppState {
	activeFooterTab: FooterTab;
	isPlaying: boolean;
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	state: AppState = {
		activeFooterTab: FooterTabs.home,
		isPlaying: false,
		version: 0,
	};

	onCreate(): void {}

	onDestroy(): void {}

	onRender(): void {
		<view>
			<FooterNav
				activeFooterTab={view.activeFooterTab}
				isPlaying={this.state.isPlaying}
				onFooterTabTap={this.handleFooterTabTap}
			/>
		</view>;
	}
}
