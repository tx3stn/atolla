// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Artist } from '../../models/Artist';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type ArtistSort, ArtistSorts, sortArtists } from './ArtistsSort';
import { ArtistView } from './ArtistView';

export interface ArtistsViewModel {
	animationsEnabled: boolean;
	imageCache: ImageCache;
	navigationController: NavigationController;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface ArtistsState {
	artists: Array<Artist>;
	isFooterVisible: boolean;
	sort: ArtistSort;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: ArtistsState = {
		artists: [],
		isFooterVisible: false,
		sort: ArtistSorts.alphabetical,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			const isFooterVisible = this.viewModel.playbackStore.track !== null;
			if (isFooterVisible !== this.state.isFooterVisible) {
				this.setState({ isFooterVisible });
			}
		});
		const isFooterVisible = this.viewModel.playbackStore.track !== null;
		if (isFooterVisible !== this.state.isFooterVisible) {
			this.setState({ isFooterVisible });
		}
		this.viewModel.transport.getAllArtists().then((artists) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ artists });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
	}

	onRender(): void {
		const { imageCache, animationsEnabled, navigationController, playbackStore, transport } =
			this.viewModel;

		const cards: Array<Card> = sortArtists(this.state.artists, this.state.sort).map((artist) => ({
			artworkKey: artist.imageUrl ?? '',
			id: artist.id,
			kind: 'artist',
			primaryText: artist.name,
			secondaryText: '',
		}));

		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
			<CardGrid
				accessibilityLabel='home-artists-grid'
				cards={cards}
				imageCache={imageCache}
				onCardTap={(card) => {
					const artist = this.state.artists.find((a) => a.id === card.id);
					if (artist) {
						navigationController.push(
							ArtistView,
							{ animationsEnabled, artist, imageCache, playbackStore, transport },
							{},
							{ animated: animationsEnabled },
						);
					}
				}}
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
		paddingTop: theme.headerHeight,
		width: '100%',
	});
}
