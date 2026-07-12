import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { SHUFFLE_PAGE_SIZE, ShuffleQueueLoader } from '../../services/ShuffleQueueLoader';
import type { PlaybackStore } from '../../stores/Playback';
import type { LanguageCode } from '../../stores/Preferences';
import { theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { hapticFeedback } from '../../utils/Haptics';
import { type Card, CardGrid } from './CardGrid';

export interface MixesSectionViewModel {
	connectionMode: ConnectionMode;
	gridColumns: number;
	language: LanguageCode;
	playbackStore: PlaybackStore;
	transport: Transport;
}

const SHUFFLE_LIBRARY_MIX_ID = 'mix-shuffle-library';
const RANDOM_ALBUM_MIX_ID = 'mix-random-album';
const RANDOM_YEAR_MIX_ID = 'mix-random-year';

export class MixesSection extends Component<MixesSectionViewModel> {
	private shuffleLoadToken = 0;

	private createMixCards(): Array<Card> {
		return [
			{
				artworkKey: '',
				icon: res.shufflelibrary,
				id: SHUFFLE_LIBRARY_MIX_ID,
				kind: 'playlist',
				primaryText: Strings.shuffleLibrary(),
				secondaryText: '',
			},
			{
				artworkKey: '',
				icon: res.randomalbum,
				id: RANDOM_ALBUM_MIX_ID,
				kind: 'playlist',
				primaryText: Strings.randomAlbum(),
				secondaryText: '',
			},
			{
				artworkKey: '',
				icon: res.randomyear,
				id: RANDOM_YEAR_MIX_ID,
				kind: 'playlist',
				primaryText: Strings.randomYear(),
				secondaryText: '',
			},
		];
	}

	private handleMixCardTap = (card: { id: string }): void => {
		hapticFeedback();

		if (card.id === SHUFFLE_LIBRARY_MIX_ID) {
			void this.startShuffleLibraryMix();
		} else if (card.id === RANDOM_ALBUM_MIX_ID) {
			void this.startRandomAlbumMix();
		} else if (card.id === RANDOM_YEAR_MIX_ID) {
			void this.startRandomYearMix();
		}
	};

	private async startShuffleLibraryMix(): Promise<void> {
		this.viewModel.playbackStore.setQueueFiller(null);
		const token = ++this.shuffleLoadToken;

		const { connectionMode, playbackStore, transport } = this.viewModel;

		if (connectionMode === ConnectionModes.online) {
			const fetchPage = (page: number, pageSize: number) =>
				transport.getShuffledLibraryTracksPage(page, pageSize);
			await this.startPaginatedMix(fetchPage, token);
			return;
		}

		const queue = await transport.getShuffledLibraryTracks().catch(() => []);

		if (this.isDestroyed() || token !== this.shuffleLoadToken) {
			return;
		}
		if (queue.length === 0) {
			return;
		}

		playbackStore.playTracks(queue, 0);
	}

	private async startRandomYearMix(): Promise<void> {
		this.viewModel.playbackStore.setQueueFiller(null);
		const token = ++this.shuffleLoadToken;

		const { transport } = this.viewModel;

		// a randomly picked year can be empty on a mixed-media server, so fetch a few candidates
		// in one request and fall through to the next if one has no tracks
		let years: Array<number>;
		try {
			years = await transport.getRandomMusicYears(3);
		} catch {
			return;
		}

		if (this.isDestroyed() || token !== this.shuffleLoadToken) {
			return;
		}

		for (const year of years) {
			const fetchPage = (page: number, pageSize: number) =>
				transport.getTracksByYearPage(year, page, pageSize);
			const outcome = await this.startPaginatedMix(fetchPage, token);
			if (outcome !== 'empty') {
				return;
			}
		}
	}

	private async startPaginatedMix(
		fetchPage: (
			page: number,
			pageSize: number,
		) => Promise<{ hasMore: boolean; items: Array<Track> }>,
		token: number,
	): Promise<'played' | 'empty' | 'aborted'> {
		let result: { hasMore: boolean; items: Array<Track> };
		try {
			result = await fetchPage(1, SHUFFLE_PAGE_SIZE);
		} catch {
			return 'aborted';
		}

		if (this.isDestroyed() || token !== this.shuffleLoadToken) {
			return 'aborted';
		}
		if (result.items.length === 0) {
			return 'empty';
		}

		const { playbackStore } = this.viewModel;
		playbackStore.playTracks(result.items, 0);

		if (result.hasMore) {
			const loader = new ShuffleQueueLoader(playbackStore, fetchPage, SHUFFLE_PAGE_SIZE);
			loader.start(2, true);
			playbackStore.setQueueFiller(loader);
		}

		return 'played';
	}

	private async startRandomAlbumMix(): Promise<void> {
		const { playbackStore, transport } = this.viewModel;

		let tracks: Array<Track>;
		try {
			const album = await transport.getRandomAlbum().catch(() => null);
			tracks = album ? await transport.getTracksByAlbum(album.id) : [];
		} catch {
			return;
		}

		if (this.isDestroyed()) {
			return;
		}
		if (tracks.length === 0) {
			return;
		}

		playbackStore.playTracks(tracks, 0);
	}

	onRender(): void {
		<layout style={styles.section}>
			<label style={styles.sectionTitle} value={Strings.homeSectionMixes()} />
			<CardGrid
				accessibilityId='home-mixes-grid'
				cards={this.createMixCards()}
				columnCount={this.viewModel.gridColumns}
				onCardTap={this.handleMixCardTap}
			/>
		</layout>;
	}
}

const styles = {
	section: new Style({
		marginBottom: 24,
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mainBold,
		marginBottom: 8,
	}),
};
