// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Artist } from '../../models/Artist';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type ArtistSort, ArtistSorts, sortArtists } from './ArtistsSort';
import { ArtistView } from './ArtistView';

export interface ArtistsViewModel {
	imageCache: ImageCache;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface ArtistsState {
	artists: Array<Artist>;
	cacheVersion: number;
	selectedArtist: Artist | null;
	sort: ArtistSort;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	private hasBeenDestroyed = false;
	private unsubscribeCache?: () => void;

	state: ArtistsState = {
		artists: [],
		cacheVersion: 0,
		selectedArtist: null,
		sort: ArtistSorts.alphabetical,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribeCache = this.viewModel.imageCache.subscribe(() => {
			this.setState({ cacheVersion: this.state.cacheVersion + 1 });
		});
		this.viewModel.transport.getAllArtists().then((artists) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ artists });
			this.viewModel.imageCache.prefetch(artists.map((a) => a.imageUrl ?? ''));
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribeCache?.();
	}

	onRender(): void {
		if (this.state.selectedArtist) {
			<ArtistView
				artist={this.state.selectedArtist}
				playbackStore={this.viewModel.playbackStore}
				transport={this.viewModel.transport}
			/>;
			return;
		}

		const cards: Array<Card> = sortArtists(this.state.artists, this.state.sort).map((artist) => ({
			artworkKey: artist.imageUrl ?? '',
			id: artist.id,
			kind: 'artist',
			primaryText: artist.name,
			secondaryText: '',
		}));

		<scroll style={styles.root}>
			<CardGrid
				accessibilityLabel='home-artists-grid'
				cards={cards}
				onCardTap={(card) => {
					const artist = this.state.artists.find((a) => a.id === card.id) ?? null;
					this.setState({ selectedArtist: artist });
				}}
				resolveArtworkSource={(key) => this.viewModel.imageCache.get(key) ?? (key || null)}
			/>
		</scroll>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.scrollPaddingBottom,
		paddingTop: 0,
		width: '100%',
	}),
};
