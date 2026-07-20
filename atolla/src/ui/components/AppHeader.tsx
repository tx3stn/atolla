import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, type HeaderTab, HeaderTabs } from '../../models/App';
import { backNavRouter } from '../../services/BackNavRouter';
import { headerStore } from '../../stores/Header';
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
	onDetailSectionTap: (tab: HeaderTab) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
}

interface AppHeaderState {
	isPanelOpen: boolean;
	revision: number;
}

export class AppHeader extends StatefulComponent<AppHeaderViewModel, AppHeaderState> {
	private rootRef = new ElementRef();
	private lastVisible = true;

	state: AppHeaderState = { isPanelOpen: false, revision: 0 };

	onCreate(): void {
		this.registerDisposable(headerStore.subscribe(() => this.handleStoreChange()));
		this.rootRef.setAttribute('top', 0);
		this.rootRef.setAttribute('opacity', 1);
	}

	onRender(): void {
		// pushed detail overrides the active tab's header with the library section tabs, keyed to the
		// detail's own type. only the real library root gets the interactive sort/letter panel. The
		// section stack is global across tabs, so honour it only when the active tab actually has a
		// detail open — otherwise a detail left mounted in another tab leaks onto this one's header.
		const detailSection = backNavRouter.hasDetail(this.viewModel.activeFooterTab)
			? headerStore.activeDetailSection()
			: null;
		const descriptor =
			detailSection === null
				? headerStore.descriptorFor(this.viewModel.activeFooterTab)
				: undefined;
		if (detailSection === null && descriptor === undefined) {
			return;
		}

		const library = descriptor?.kind === 'library' ? descriptor : null;
		const showLibraryTabs = detailSection !== null || library !== null;
		const libraryActiveTab = detailSection ?? library?.activeTab ?? null;
		const isPanelOpen = library !== null && this.state.isPanelOpen;
		<view
			accessibilityId='app-header'
			accessibilityLabel='app-header'
			onDrag={library ? this.handleDrag : undefined}
			onDragPredicate={library ? this.isVerticalDrag : undefined}
			ref={this.rootRef}
			style={isPanelOpen ? styles.rootOpen : styles.root}
		>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					connectionMode={this.viewModel.connectionMode}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>

			{descriptor?.kind === 'title' && (
				<view style={styles.titleWrap}>
					<view style={styles.titleContainer}>
						<label style={styles.title} value={descriptor.title} />
					</view>
				</view>
			)}

			{showLibraryTabs && (
				<view
					accessibilityId='library-header-nav'
					accessibilityLabel='library-header-nav'
					style={styles.scrollViewport}
				>
					<scroll horizontal={true} showsHorizontalScrollIndicator={false} style={styles.scroll}>
						<view style={styles.tabsRow}>
							<LibraryHeaderTab
								active={libraryActiveTab === HeaderTabs.artists}
								onTap={this.handleArtistsTabTap}
								tab={HeaderTabs.artists}
							/>
							<LibraryHeaderTab
								active={libraryActiveTab === HeaderTabs.albums}
								onTap={this.handleAlbumsTabTap}
								tab={HeaderTabs.albums}
							/>
							<LibraryHeaderTab
								active={libraryActiveTab === HeaderTabs.playlists}
								onTap={this.handlePlaylistsTabTap}
								tab={HeaderTabs.playlists}
							/>
							<LibraryHeaderTab
								active={libraryActiveTab === HeaderTabs.genres}
								onTap={this.handleGenresTabTap}
								tab={HeaderTabs.genres}
							/>
							<layout style={styles.trailingSpacer} />
						</view>
					</scroll>
				</view>
			)}

			{showLibraryTabs && (
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

	onViewModelUpdate(prevViewModel?: AppHeaderViewModel): void {
		if (prevViewModel && prevViewModel.activeFooterTab !== this.viewModel.activeFooterTab) {
			headerStore.setVisible(true);
		}
	}

	private animateVisibility(visible: boolean): void {
		const hiddenTop = -theme.padding.scrollHeader(null);
		const apply = (): void => {
			this.rootRef.setAttribute('top', visible ? 0 : hiddenTop);
			this.rootRef.setAttribute('opacity', visible ? 1 : 0);
		};
		if (!this.viewModel.animationsEnabled) {
			apply();
			return;
		}
		void this.animatePromise({ damping: 30, stiffness: 420 }, apply);
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
		const descriptor = headerStore.descriptorFor(this.viewModel.activeFooterTab);
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
		const visible = headerStore.isVisible();
		if (visible !== this.lastVisible) {
			this.lastVisible = visible;
			this.animateVisibility(visible);
		}
		this.setState({ revision: this.state.revision + 1 });
	}

	private isVerticalDrag = (event: DragEvent): boolean => {
		return Math.abs(event.deltaY) > Math.abs(event.deltaX);
	};

	private tapTab(tab: HeaderTab): void {
		const inActiveTabDetail =
			backNavRouter.hasDetail(this.viewModel.activeFooterTab) &&
			headerStore.activeDetailSection() !== null;
		if (inActiveTabDetail) {
			this.viewModel.onDetailSectionTap(tab);
			return;
		}
		const descriptor = headerStore.descriptorFor(this.viewModel.activeFooterTab);
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
	scrollViewport: new Style<View>({
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
	trailingSpacer: new Style<Layout>({
		width: 65,
	}),
};
