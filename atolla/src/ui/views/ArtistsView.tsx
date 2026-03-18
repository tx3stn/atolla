// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Artist } from '../../models/Artist';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';

export interface ArtistsViewModel {
	transport: Transport;
}

interface ArtistsState {
	artists: Array<Artist>;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	state: ArtistsState = {
		artists: [],
	};

	onCreate(): void {
		this.viewModel.transport.getAllArtists().then((artists) => {
			this.setState({ artists });
		});
	}

	onRender(): void {
		const cards: Array<Card> = this.state.artists.map((artist) => ({
			artworkKey: artist.imageUrl ?? '',
			id: artist.id,
			kind: 'artist',
			primaryText: artist.name,
			secondaryText: '',
		}));

		<scroll style={styles.root}>
			<CardGrid
				accessibilityLabel='artists-grid'
				cards={cards}
				onCardTap={() => {}}
				resolveArtworkSource={(key) => key || null}
			/>
		</scroll>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		padding: 8,
		width: '100%',
	}),
};
