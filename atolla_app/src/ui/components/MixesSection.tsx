import res from 'atolla_app/res';
import Strings from 'atolla_app/src/Strings';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import {
	SHUFFLE_PAGE_SIZE,
	ShuffleQueueLoader,
} from 'atolla_player/src/services/ShuffleQueueLoader';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Layout } from 'valdi_tsx/src/NativeTemplateElements';
import { type ConnectionMode, ConnectionModes } from '../../models/App';
import type { LanguageCode } from '../../stores/Preferences';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import { type Card, CardGrid } from './CardGrid';
import { HomeSectionHeader } from './HomeSectionHeader';

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
	private cachedMixCards: Array<Card> = [];
	private cachedMixCardsLanguage: LanguageCode | null = null;
	private shuffleLoadToken = 0;

	// the card titles are localized, so a language change has to rebuild them
	private getMixCards(): Array<Card> {
		if (this.viewModel.language !== this.cachedMixCardsLanguage) {
			this.cachedMixCardsLanguage = this.viewModel.language;
			this.cachedMixCards = this.createMixCards();
		}

		return this.cachedMixCards;
	}

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
				Promise.resolve(transport.getShuffledLibraryTracks(page, pageSize));
			await this.startPaginatedMix(fetchPage, token);
			return;
		}

		const queue = await Promise.resolve(transport.getShuffledLibraryTracks(1, 500))
			.then(({ items }) => items)
			.catch(() => []);

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
				Promise.resolve(transport.getTracksByYear(year, page, pageSize));
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
			const album = await Promise.resolve(transport.getRandomAlbum()).catch(() => null);
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
			<HomeSectionHeader accessibilityId='home-section-mixes' title={Strings.homeSectionMixes()} />
			<CardGrid
				accessibilityId='home-mixes-grid'
				cards={this.getMixCards()}
				columnCount={this.viewModel.gridColumns}
				onCardTap={this.handleMixCardTap}
			/>
		</layout>;
	}
}

const styles = {
	section: new Style<Layout>({
		marginBottom: theme.scale(24),
		width: '100%',
	}),
};
