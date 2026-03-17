// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { theme } from './theme';
import { Preferences } from './stores/Preferences';
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';

export type AppViewModel = Record<string, never>;

interface AppState {
	activeFooterTab: FooterTab;
	isPlaying: boolean;
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private preferences = new Preferences();

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		isPlaying: false,
		version: 0,
	};

	onCreate(): void {}

	onDestroy(): void {}

	handleFooterTabTap = (tab: FooterTab): void => {
		this.setState({ activeFooterTab: tab });
	};

	onRender(): void {
		<view style={styles.root}>
			<FooterNav
				activeTab={this.state.activeFooterTab}
				onFooterTabTap={this.handleFooterTabTap}
				preferences={this.preferences}
			/>
		</view>;
	}
}

const styles = {
	root: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'flex-start',
		position: 'relative',
		width: '100%',
	}),
};
