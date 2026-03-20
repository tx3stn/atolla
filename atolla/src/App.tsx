// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { PlaybackStore } from './stores/Playback';
import { Preferences } from './stores/Preferences';
import { theme } from './theme';
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';
import { NowPlayingBar } from './ui/components/NowPlayingBar';
import { HomeView } from './ui/views/HomeView';
import { NowPlayingView } from './ui/views/NowPlayingView';
import { SearchView } from './ui/views/SearchView';
import { SettingsView } from './ui/views/SettingsView';

export type AppViewModel = Record<string, never>;

interface AppState {
	activeFooterTab: FooterTab;
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private overlayRef = new ElementRef();
	private playbackStore = new PlaybackStore();
	private preferences = new Preferences();
	private unsubscribePlayback?: () => void;

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		version: 0,
	};

	onCreate(): void {
		this.unsubscribePlayback = this.playbackStore.subscribe(() => {
			this.setState({ version: this.state.version + 1 });
		});
	}

	onDestroy(): void {
		this.unsubscribePlayback?.();
	}

	handleFooterTabTap = (tab: FooterTab): void => {
		this.setState({ activeFooterTab: tab });
	};

	handleBarTap = (): void => {
		this.animate({ beginFromCurrentState: true, curve: 'easeOut', duration: 0.42 }, () => {
			this.overlayRef.setAttribute('top', 0);
		});
	};

	handleNowPlayingClose = (): void => {
		this.animate({ beginFromCurrentState: true, curve: 'easeIn', duration: 0.36 }, () => {
			this.overlayRef.setAttribute('top', 2000);
		});
	};

	handleNowPlayingDragUpdate = (deltaY: number): void => {
		this.overlayRef.setAttribute('top', deltaY);
	};

	handleNowPlayingDragCancel = (): void => {
		this.animate({ beginFromCurrentState: true, curve: 'easeOut', duration: 0.32 }, () => {
			this.overlayRef.setAttribute('top', 0);
		});
	};

	onRender(): void {
		const { track, album, isPlaying, progressSeconds, artistLogoUrl } = this.playbackStore;

		<view style={styles.root}>
			{this.state.activeFooterTab === FooterTabs.home && (
				<HomeView playbackStore={this.playbackStore} />
			)}
			{this.state.activeFooterTab === FooterTabs.search && <SearchView />}
			{this.state.activeFooterTab === FooterTabs.settings && (
				<SettingsView preferences={this.preferences} />
			)}

			<FooterNav
				activeTab={this.state.activeFooterTab}
				onFooterTabTap={this.handleFooterTabTap}
				preferences={this.preferences}
			/>

			{track && album && (
				<NowPlayingBar
					album={album}
					isPlaying={isPlaying}
					onDismiss={() => this.playbackStore.stop()}
					onTap={this.handleBarTap}
					progressSeconds={progressSeconds}
					track={track}
				/>
			)}

			{track && album && (
				<view ref={this.overlayRef} style={styles.nowPlayingOverlay}>
					<NowPlayingView
						album={album}
						artistLogoUrl={artistLogoUrl}
						isPlaying={isPlaying}
						onClose={this.handleNowPlayingClose}
						onDragCancel={this.handleNowPlayingDragCancel}
						onDragUpdate={this.handleNowPlayingDragUpdate}
						onNext={() => this.playbackStore.next()}
						onPlayPause={() => this.playbackStore.playPause()}
						onPrevious={() => this.playbackStore.previous()}
						progressSeconds={progressSeconds}
						track={track}
					/>
				</view>
			)}
		</view>;
	}
}

const styles = {
	nowPlayingOverlay: new Style({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 2000,
		zIndex: 30,
	}),
	root: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'flex-start',
		position: 'relative',
		width: '100%',
	}),
};
