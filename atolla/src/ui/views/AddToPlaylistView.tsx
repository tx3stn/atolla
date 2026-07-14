import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { ImageCache } from '../../services/ImageCache';
import type { ToastService } from '../../services/ToastService';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { LoopingArrowSpinner } from '../components/LoopingArrowSpinner';
import { Modal } from '../components/Modal';
import { addTracksToPlaylist } from '../flows/CreatePlaylist';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';

export interface AddToPlaylistViewModel {
	animationsEnabled: boolean;
	gridColumns?: number;
	imageCache?: ImageCache;
	onDismiss: () => void;
	toastService: ToastService;
	tracks: Array<Track>;
	transport: Transport;
}

interface AddToPlaylistState {
	errorMessage: string | null;
	hasMore: boolean;
	isAddingToPlaylist: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	playlists: Array<Playlist>;
}

export class AddToPlaylistView extends StatefulComponent<
	AddToPlaylistViewModel,
	AddToPlaylistState
> {
	private readonly pagedGridController = createPagedGridController<Playlist>({
		fetchPage: (page) => this.viewModel.transport.getPlaylists(page, gridPaginationConfig.pageSize),
		isDestroyed: () => this.isDestroyed(),
		setState: (patch) => {
			this.setState({
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
				playlists: patch.items ?? this.state.playlists,
			});
		},
	});
	private clearErrorMessage = (): void => {
		this.setState({ errorMessage: null });
	};

	state: AddToPlaylistState = {
		errorMessage: null,
		hasMore: true,
		isAddingToPlaylist: false,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
		playlists: [],
	};

	onCreate(): void {
		void this.pagedGridController.loadNextPage();
	}

	loadMore = (): void => {
		void this.pagedGridController.loadNextPage();
	};

	handlePlaylistTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		if (this.state.isAddingToPlaylist) return;
		const { tracks, transport, toastService, onDismiss } = this.viewModel;

		this.setState({ isAddingToPlaylist: true });
		void addTracksToPlaylist(card.id, tracks, transport.addItemToPlaylist.bind(transport))
			.then(() => {
				toastService.show(Strings.addedToPlaylist());
				if (this.isDestroyed()) return;
				onDismiss();
			})
			.catch((e: unknown) => {
				if (this.isDestroyed()) return;
				const message =
					e != null &&
					typeof e === 'object' &&
					'message' in e &&
					typeof (e as { message: unknown }).message === 'string'
						? (e as { message: string }).message
						: 'Unknown error';
				this.setState({ errorMessage: message, isAddingToPlaylist: false });
			});
	};

	onRender(): void {
		const { onDismiss } = this.viewModel;
		const { errorMessage, isAddingToPlaylist, playlists } = this.state;
		const gridColumns = this.viewModel.gridColumns ?? 2;

		const cards: Array<Card> = playlists.map((p) => ({
			artworkKey: p.imageUrl ?? '',
			id: p.id,
			kind: 'playlist',
			primaryText: p.name,
			secondaryText: '',
		}));

		<view
			accessibilityId='add-to-playlist-view'
			accessibilityLabel='add-to-playlist-view'
			style={styles.root}
		>
			<scroll style={styles.scroll}>
				<CardGrid
					accessibilityId='add-to-playlist-grid'
					cards={cards}
					columnCount={gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardTap={this.handlePlaylistTap}
					onLoadMore={this.state.hasMore && !this.state.nextPageFailed ? this.loadMore : undefined}
					onRetryLoadMore={this.state.nextPageFailed ? this.loadMore : undefined}
				/>
			</scroll>
			<view style={styles.header}>
				<label style={styles.title} value={Strings.addToPlaylist().toUpperCase()} />
				{isAddingToPlaylist ? (
					<view style={styles.closeButton}>
						<LoopingArrowSpinner
							accessibilityId='add-to-playlist-adding-spinner'
							size={20}
							tint={theme.colors.active}
						/>
					</view>
				) : (
					<view
						accessibilityId='add-to-playlist-cancel'
						accessibilityLabel='add-to-playlist-cancel'
						onTap={onDismiss}
						style={styles.closeButton}
					>
						<label style={styles.closeLabel} value={Strings.cancel()} />
					</view>
				)}
			</view>
			{errorMessage && (
				<Modal
					body={errorMessage}
					onClose={this.clearErrorMessage}
					title={Strings.playlistEditErrorTitle()}
				/>
			)}
		</view>;
	}
}

const styles = {
	closeButton: new Style<View>({
		padding: 8,
	}),
	closeLabel: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
	header: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgFrosted,
		flexDirection: 'row',
		justifyContent: 'space-between',
		left: 0,
		paddingBottom: 12,
		paddingLeft: 16,
		paddingRight: 16,
		paddingTop: theme.padding.headerTop,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 10,
	}),
	root: new Style<View>({
		backgroundColor: theme.colors.bg,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	scroll: new Style<ScrollView>({
		bottom: 0,
		left: 0,
		padding: 8,
		paddingBottom: 24,
		paddingTop: theme.headerHeight + theme.padding.deviceInset + 8,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	title: new Style<Label>({
		...theme.text.mutedHeader,
	}),
};
