import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import { type HeaderTab, HeaderTabs } from '../../models/App';
import { theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { ConnectivityFab } from './ConnectivityFab';
import { LibraryHeaderTab } from './HeaderTab';
import { SortNavPanel } from './SortNavPanel';
import { TouchEventState } from './TouchEventState';

interface LibraryHeaderViewModel {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	onAlphabetLetterTap?: (letter: string | null) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onTabTap: (tabId: HeaderTab) => void;
}

interface LibraryHeaderState {
	activeLetterFilter: string | null;
	isPanelOpen: boolean;
}

export class LibraryHeaderNav extends StatefulComponent<
	LibraryHeaderViewModel,
	LibraryHeaderState
> {
	private rootRef = new ElementRef();
	private readonly hiddenTop = -theme.padding.scrollHeader(true);

	state: LibraryHeaderState = {
		activeLetterFilter: null,
		isPanelOpen: false,
	};

	onCreate(): void {
		if (!this.viewModel.animationsEnabled) {
			this.rootRef.setAttribute('top', 0);
			this.rootRef.setAttribute('opacity', 1);
			return;
		}

		this.rootRef.setAttribute('top', this.hiddenTop);
		this.rootRef.setAttribute('opacity', 0.88);

		Promise.resolve().then(() => {
			this.animatePromise({ damping: 26, stiffness: 400 }, () => {
				this.rootRef.setAttribute('top', 1);
				this.rootRef.setAttribute('opacity', 1);
			}).then(() => {
				this.animatePromise({ damping: 30, stiffness: 420 }, () => {
					this.rootRef.setAttribute('top', 0);
				});
			});
		});
	}

	onRender() {
		const { isPanelOpen, activeLetterFilter } = this.state;

		<view
			accessibilityId='library-header-nav'
			accessibilityLabel='library-header-nav'
			onDrag={this.handleDrag}
			onDragPredicate={this.isVerticalDrag}
			ref={this.rootRef}
			style={isPanelOpen ? styles.libraryTabsOpen : styles.libraryTabs}
		>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					connectionMode={this.viewModel.connectionMode}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>
			<view style={styles.scrollViewport}>
				<scroll horizontal={true} showsHorizontalScrollIndicator={false} style={styles.scroll}>
					<view style={styles.tabsRow}>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.artists}
							onTap={this.handleArtistsTabTap}
							tab={HeaderTabs.artists}
						/>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.albums}
							onTap={this.handleAlbumsTabTap}
							tab={HeaderTabs.albums}
						/>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.playlists}
							onTap={this.handlePlaylistsTabTap}
							tab={HeaderTabs.playlists}
						/>
						<LibraryHeaderTab
							active={this.viewModel.activeTab === HeaderTabs.genres}
							onTap={this.handleGenresTabTap}
							tab={HeaderTabs.genres}
						/>
						<view style={styles.trailingSpacer} />
					</view>
				</scroll>
			</view>
			<view style={styles.scrollHintWrap}>
				<label style={styles.scrollHint} value='>' />
			</view>

			{isPanelOpen && <view onTap={this.closeSortPanel} style={styles.dismissOverlay} />}

			{isPanelOpen && (
				<SortNavPanel activeLetterFilter={activeLetterFilter} onLetterTap={this.handleLetterTap} />
			)}
		</view>;
	}

	onViewModelUpdate(prevViewModel?: LibraryHeaderViewModel): void {
		if (!prevViewModel) return;
		if (
			this.viewModel.activeTab !== prevViewModel.activeTab &&
			this.state.activeLetterFilter != null
		) {
			this.setState({ activeLetterFilter: null });
			this.viewModel.onAlphabetLetterTap?.(null);
		}
	}

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

	private closeSortPanel = (): void => {
		this.setState({ isPanelOpen: false });
	};

	private handleLetterTap = (letter: string): void => {
		const next = this.state.activeLetterFilter === letter ? null : letter;
		this.setState({ activeLetterFilter: next });
		this.viewModel.onAlphabetLetterTap?.(next);
	};

	private handleArtistsTabTap = (): void => {
		this.viewModel.onTabTap(HeaderTabs.artists);
	};

	private handleAlbumsTabTap = (): void => {
		this.viewModel.onTabTap(HeaderTabs.albums);
	};

	private handlePlaylistsTabTap = (): void => {
		this.viewModel.onTabTap(HeaderTabs.playlists);
	};

	private handleGenresTabTap = (): void => {
		this.viewModel.onTabTap(HeaderTabs.genres);
	};

	private isVerticalDrag = (event: DragEvent): boolean => {
		return Math.abs(event.deltaY) > Math.abs(event.deltaX);
	};
}

const styles = {
	dismissOverlay: new Style({
		bottom: 0,
		left: 0,
		position: 'absolute' as const,
		right: 0,
		top: theme.padding.scrollHeader(null),
	}),
	leadingFabSlot: new Style<Layout>({
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingLeft: 6,
		paddingRight: 6,
		width: 60,
	}),
	libraryTabs: new Style({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row' as const,
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		paddingTop: theme.padding.deviceInset,
		position: 'absolute' as const,
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	libraryTabsOpen: new Style({
		backgroundColor: theme.colors.transparent,
		bottom: 0,
		flexDirection: 'row' as const,
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		paddingTop: theme.padding.deviceInset,
		position: 'absolute' as const,
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	scroll: new Style<Layout>({
		flexGrow: 1,
		paddingTop: 4,
	}),
	scrollHint: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.grey,
	}),
	scrollHintWrap: new Style({
		alignItems: 'center' as const,
		backgroundColor: theme.colors.bg,
		justifyContent: 'center' as const,
		paddingLeft: 6,
		paddingRight: 10,
	}),
	scrollViewport: new Style({
		flexGrow: 1,
		minWidth: 0,
		slowClipping: true,
	}),
	tabsRow: new Style<Layout>({
		flexDirection: 'row',
		flexShrink: 0,
		paddingLeft: 8,
		paddingRight: 6,
	}),
	trailingSpacer: new Style({
		width: 65,
	}),
};
