// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Album } from '../../models/Album';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type AlbumSort, AlbumSorts, sortAlbums } from './AlbumsSort';
import { AlbumView } from './AlbumView';

export interface AlbumsViewModel {
	animationsEnabled: boolean;
	imageCache: ImageCache;
	navigationController: NavigationController;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface AlbumsState {
	albums: Array<Album>;
	cacheVersion: number;
	isFooterVisible: boolean;
	sort: AlbumSort;
}

export class AlbumsView extends StatefulComponent<AlbumsViewModel, AlbumsState> {
	private hasBeenDestroyed = false;
	private unsubscribeCache?: () => void;
	private unsubscribePlayback?: () => void;

	state: AlbumsState = {
		albums: [],
		cacheVersion: 0,
		isFooterVisible: false,
		sort: AlbumSorts.alphabetical,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribeCache = this.viewModel.imageCache.subscribe(() => {
			this.setState({ cacheVersion: this.state.cacheVersion + 1 });
		});
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: this.viewModel.playbackStore.track !== null });
		});
		this.setState({ isFooterVisible: this.viewModel.playbackStore.track !== null });
		this.viewModel.transport.getAllAlbums().then((albums) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ albums });
			this.viewModel.imageCache.prefetch(albums.map((a) => a.imageUrl ?? ''));
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribeCache?.();
		this.unsubscribePlayback?.();
	}

	onRender(): void {
		const { imageCache, animationsEnabled, navigationController, playbackStore, transport } =
			this.viewModel;

		const cards: Array<Card> = sortAlbums(this.state.albums, this.state.sort).map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: album.artistName,
		}));

		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
			<CardGrid
				accessibilityLabel='home-albums-grid'
				cards={cards}
				onCardTap={(card) => {
					const album = this.state.albums.find((a) => a.id === card.id);
					if (album) {
						navigationController.push(
							AlbumView,
							{ album, playbackStore, transport },
							{},
							{ animated: animationsEnabled },
						);
					}
				}}
				resolveArtworkSource={(key) => imageCache.get(key) ?? (key || null)}
			/>
		</scroll>;
	}
}

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: 0,
		width: '100%',
	});
}
