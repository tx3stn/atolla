import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, type HeaderTab, HeaderTabs } from '../../models/App';
import type { HeaderStore } from '../../stores/Header';
import { theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { ConnectivityFab } from './ConnectivityFab';
import { LibraryHeaderTab } from './HeaderTab';
import { SortNavPanel } from './SortNavPanel';
import { TouchEventState } from './TouchEventState';

export interface AppHeaderViewModel {
	activeFooterTab: FooterTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	headerStore: HeaderStore;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
}

interface AppHeaderState {
	isPanelOpen: boolean;
	revision: number;
}

export class AppHeader extends StatefulComponent<AppHeaderViewModel, AppHeaderState> {
	state: AppHeaderState = { isPanelOpen: false, revision: 0 };

	onCreate(): void {
		this.registerDisposable(this.viewModel.headerStore.subscribe(() => this.handleStoreChange()));
	}

	onRender(): void {
		const descriptor = this.viewModel.headerStore.descriptorFor(this.viewModel.activeFooterTab);
		if (!descriptor) {
			return;
		}

		const library = descriptor.kind === 'library' ? descriptor : null;
		const isPanelOpen = library !== null && this.state.isPanelOpen;
		<view
			accessibilityId={'app-header'}
			accessibilityLabel={'app-header'}
			onDrag={library ? this.handleDrag : undefined}
			onDragPredicate={library ? this.isVerticalDrag : undefined}
			style={isPanelOpen ? styles.rootOpen : styles.root}
		>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					connectionMode={this.viewModel.connectionMode}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>

			{descriptor.kind === 'title' && (
				<view style={styles.titleWrap}>
					<view style={styles.titleContainer}>
						<label style={styles.title} value={descriptor.title} />
					</view>
				</view>
			)}

			{library && (
				<view
					accessibilityId='library-header-nav'
					accessibilityLabel='library-header-nav'
					style={styles.scrollViewport}
				>
					<scroll horizontal={true} showsHorizontalScrollIndicator={false} style={styles.scroll}>
						<view style={styles.tabsRow}>
							<LibraryHeaderTab
								active={library.activeTab === HeaderTabs.artists}
								onTap={this.handleArtistsTabTap}
								tab={HeaderTabs.artists}
							/>
							<LibraryHeaderTab
								active={library.activeTab === HeaderTabs.albums}
								onTap={this.handleAlbumsTabTap}
								tab={HeaderTabs.albums}
							/>
							<LibraryHeaderTab
								active={library.activeTab === HeaderTabs.playlists}
								onTap={this.handlePlaylistsTabTap}
								tab={HeaderTabs.playlists}
							/>
							<LibraryHeaderTab
								active={library.activeTab === HeaderTabs.genres}
								onTap={this.handleGenresTabTap}
								tab={HeaderTabs.genres}
							/>
							<view style={styles.trailingSpacer} />
						</view>
					</scroll>
				</view>
			)}

			{library && (
				<view style={styles.scrollHintWrap}>
					<label style={styles.scrollHint} value='>' />
				</view>
			)}

			{isPanelOpen && <view onTap={this.closeSortPanel} style={styles.dismissOverlay} />}

			{library && this.state.isPanelOpen && (
				<SortNavPanel
					activeLetterFilter={library.letterFilter}
					onLetterTap={this.handleLetterTap}
				/>
			)}
		</view>;
	}

	private closeSortPanel = (): void => {
		this.setState({ isPanelOpen: false });
	};

	private handleAlbumsTabTap = (): void => {
		this.tapTab(HeaderTabs.albums);
	};

	private handleArtistsTabTap = (): void => {
		this.tapTab(HeaderTabs.artists);
	};

	private handleDrag = (event: DragEvent): void => {
		if (event.state !== TouchEventState.Changed && event.state !== TouchEventState.Ended) {
			return;
		}
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}
		if (event.deltaY >= 18 && !this.state.isPanelOpen) {
			this.setState({ isPanelOpen: true });
			return;
		}
		if (event.deltaY <= -18 && this.state.isPanelOpen) {
			this.setState({ isPanelOpen: false });
		}
	};

	private handleGenresTabTap = (): void => {
		this.tapTab(HeaderTabs.genres);
	};

	private handleLetterTap = (letter: string): void => {
		const descriptor = this.viewModel.headerStore.descriptorFor(this.viewModel.activeFooterTab);
		if (descriptor?.kind !== 'library') {
			return;
		}
		const next = descriptor.letterFilter === letter ? null : letter;
		descriptor.onAlphabetLetterTap(next);
	};

	private handlePlaylistsTabTap = (): void => {
		this.tapTab(HeaderTabs.playlists);
	};

	private handleStoreChange(): void {
		this.setState({ revision: this.state.revision + 1 });
	}

	private isVerticalDrag = (event: DragEvent): boolean => {
		return Math.abs(event.deltaY) > Math.abs(event.deltaX);
	};

	private tapTab(tab: HeaderTab): void {
		const descriptor = this.viewModel.headerStore.descriptorFor(this.viewModel.activeFooterTab);
		if (descriptor?.kind !== 'library') {
			return;
		}
		descriptor.onTabTap(tab);
	}
}

const styles = {
	dismissOverlay: new Style<View>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: theme.padding.scrollHeader(null),
	}),
	leadingFabSlot: new Style<View>({
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingLeft: 6,
		paddingRight: 6,
		width: 60,
	}),
	root: new Style<View>({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		paddingTop: theme.padding.deviceInset,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	rootOpen: new Style<View>({
		backgroundColor: theme.colors.transparent,
		bottom: 0,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		paddingTop: theme.padding.deviceInset,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	scroll: new Style<ScrollView>({
		flexGrow: 1,
		paddingTop: 4,
	}),
	scrollHint: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.grey,
	}),
	scrollHintWrap: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		justifyContent: 'center',
		paddingLeft: 6,
		paddingRight: 10,
	}),
	scrollViewport: new Style({
		flexGrow: 1,
		minWidth: 0,
		slowClipping: true,
	}),
	tabsRow: new Style<View>({
		flexDirection: 'row',
		flexShrink: 0,
		paddingLeft: 8,
		paddingRight: 6,
	}),
	title: new Style<Label>({
		...theme.text.display,
		textAlign: 'center',
	}),
	titleContainer: new Style<View>({
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: theme.radius.pill,
		padding: 6,
		paddingLeft: 12,
		paddingRight: 12,
	}),
	titleWrap: new Style<View>({
		alignItems: 'flex-end',
		bottom: 0,
		justifyContent: 'center',
		left: 64,
		paddingRight: 16,
		position: 'absolute',
		right: 0,
		top: theme.padding.deviceInset,
	}),
	trailingSpacer: new Style<View>({
		width: 65,
	}),
};
