// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import type { CardDetailItem } from '../components/CardDetailList';
import { CardDetailList } from '../components/CardDetailList';
import { type Card, CardGrid } from '../components/CardGrid';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { ViewHeader } from '../components/ViewHeader';
import {
	createHomeAlbumsSignature,
	parseHomeAlbumsCache,
	serializeHomeAlbumsCache,
} from './HomeAlbumsCache';

export interface HomeViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	gridColumns: number;
	homeAlbumsStore?: HomeAlbumsPersistence;
	onOpenAlbum: (album: Album) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	playbackStore: PlaybackStore;
	recentlyPlayedTracks: Array<Track>;
	transport: Transport;
}

export interface HomeAlbumsPersistence {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

interface HomeState {
	albums: Array<Album>;
	isLoadingAlbums: boolean;
}

const HOME_ALBUMS_CACHE_KEY = 'albums_v1';

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private hasBeenDestroyed = false;
	private lastAlbumsSignature = '';
	private loadGeneration = 0;

	state: HomeState = {
		albums: [],
		isLoadingAlbums: true,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.loadAlbums();
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
	}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (this.viewModel.transport !== prevViewModel.transport) {
			this.loadAlbums();
		}
	}

	private loadAlbums(): void {
		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;
		this.setState({ isLoadingAlbums: true });
		this.restoreCachedAlbums(generation);

		if (!shouldApplyTransportAlbumsToHome(this.viewModel.connectionMode)) {
			this.setState({ isLoadingAlbums: false });
			return;
		}

		this.refreshAlbums(generation);
	}

	private restoreCachedAlbums(generation: number): void {
		const store = this.viewModel.homeAlbumsStore;
		if (!store) {
			return;
		}

		store
			.fetchString(HOME_ALBUMS_CACHE_KEY)
			.then((raw) => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}

				const cachedAlbums = parseHomeAlbumsCache(raw);
				if (cachedAlbums == null) {
					return;
				}

				this.lastAlbumsSignature = createHomeAlbumsSignature(cachedAlbums);
				this.setState({ albums: cachedAlbums, isLoadingAlbums: false });
			})
			.catch(() => {
				// No cache available yet.
			});
	}

	private refreshAlbums(generation: number): void {
		const shouldApplyTransportAlbums = shouldApplyTransportAlbumsToHome(
			this.viewModel.connectionMode,
		);
		this.viewModel.transport
			.getAllAlbums()
			.then((albums) => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}

				if (!shouldApplyTransportAlbums) {
					if (this.state.isLoadingAlbums) {
						this.setState({ isLoadingAlbums: false });
					}
					return;
				}

				const nextSignature = createHomeAlbumsSignature(albums);
				const hasChanged = nextSignature !== this.lastAlbumsSignature;
				this.lastAlbumsSignature = nextSignature;

				if (hasChanged || this.state.isLoadingAlbums) {
					this.setState({ albums, isLoadingAlbums: false });
				}

				this.persistAlbums(albums);
			})
			.catch(() => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}

				if (this.state.isLoadingAlbums) {
					this.setState({ isLoadingAlbums: false });
				}
			});
	}

	private persistAlbums(albums: Array<Album>): void {
		const store = this.viewModel.homeAlbumsStore;
		if (!store) {
			return;
		}

		void store.storeString(HOME_ALBUMS_CACHE_KEY, serializeHomeAlbumsCache(albums)).catch(() => {
			// Cache persistence is best-effort only.
		});
	}

	private createOnThisDayCards(): Array<CardDetailItem> {
		return createOnThisDayCardDetails(this.state.albums, new Date());
	}

	private createRecentlyAddedCards(): Array<Card> {
		const limit = Math.max(1, this.viewModel.gridColumns) * 2;
		return [...this.state.albums]
			.sort((left, right) => (right.releaseDate ?? '').localeCompare(left.releaseDate ?? ''))
			.slice(0, limit)
			.map((album) => ({
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				primaryText: album.name,
				secondaryText: album.artistName,
			}));
	}

	private createRecentlyPlayedEntries(): Array<TrackListEntry> {
		return this.viewModel.recentlyPlayedTracks.slice(0, 5).map((track, index) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			leadingLabel: String(index + 1),
			meta: track.artistName ?? track.albumName ?? '',
			title: track.name,
			track,
		}));
	}

	private handleAlbumCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'playlist';
	}): void => {
		if (card.kind !== 'album') {
			return;
		}

		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) {
			return;
		}

		this.viewModel.onOpenAlbum(album);
	};

	private handleRecentlyPlayedTrackTap = (trackId: string): void => {
		const queue = this.viewModel.recentlyPlayedTracks.slice(0, 5);
		const trackIndex = queue.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		this.viewModel.playbackStore.playTracks(queue, trackIndex);
	};

	onRender(): void {
		const onThisDayCards = this.createOnThisDayCards();
		const recentlyAddedCards = this.createRecentlyAddedCards();
		const recentlyPlayedTracks = this.createRecentlyPlayedEntries();

		<layout accessibilityLabel='home-view' contentDescription='home-view' style={styles.root}>
			<ViewHeader
				animationsEnabled={this.viewModel.animationsEnabled}
				connectionMode={this.viewModel.connectionMode}
				downloadingCount={this.viewModel.downloadingCount}
				onRequestModeChange={this.viewModel.onRequestModeChange}
				title='HOME'
			/>

			<scroll style={createScrollStyle(this.viewModel.playbackStore.track !== null)}>
				<layout style={styles.content}>
					{this.state.isLoadingAlbums ? (
						<label style={styles.emptyState} value='loading home' />
					) : (
						<layout style={styles.sections}>
							<layout style={styles.section}>
								<label style={styles.sectionTitle} value='ON THIS DAY' />
								{onThisDayCards.length > 0 ? (
									<CardDetailList
										accessibilityLabel='home-on-this-day-grid'
										cards={onThisDayCards}
										onCardTap={this.handleAlbumCardTap}
									/>
								) : (
									<label style={styles.emptyState} value='no anniversaries today' />
								)}
							</layout>

							<layout style={styles.section}>
								<label style={styles.sectionTitle} value='RECENTLY ADDED' />
								<CardGrid
									accessibilityLabel='home-recently-added-grid'
									cards={recentlyAddedCards}
									columnCount={this.viewModel.gridColumns}
									onCardTap={this.handleAlbumCardTap}
								/>
							</layout>

							<layout style={styles.section}>
								<label style={styles.sectionTitle} value='RECENTLY PLAYED' />
								{recentlyPlayedTracks.length > 0 ? (
									<TrackList
										onTrackTap={this.handleRecentlyPlayedTrackTap}
										tracks={recentlyPlayedTracks}
									/>
								) : (
									<label style={styles.emptyState} value='nothing played yet' />
								)}
							</layout>
						</layout>
					)}
				</layout>
			</scroll>
		</layout>;
	}
}

export function shouldApplyTransportAlbumsToHome(connectionMode: ConnectionMode): boolean {
	return connectionMode !== ConnectionModes.offline;
}

function createScrollStyle(isFooterVisible: boolean): Style {
	return isFooterVisible ? scrollStyles.withFooter : scrollStyles.withoutFooter;
}

const scrollStyles = {
	withFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: scrollPaddingBottom(true),
		width: '100%',
	}),
	withoutFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: scrollPaddingBottom(false),
		width: '100%',
	}),
};

const styles = {
	content: new Style({
		paddingBottom: 18,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: theme.headerHeight + 8,
		width: '100%',
	}),
	emptyState: new Style<Label>({
		...theme.text.sub,
		marginTop: 6,
	}),
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	section: new Style({
		marginBottom: 18,
		width: '100%',
	}),
	sections: new Style({
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mainBold,
		marginBottom: 8,
	}),
};

interface OnThisDayCandidate {
	album: Album;
	originalReleaseDate: Date;
	originalReleaseYear: number;
}

export function createOnThisDayCardDetails(albums: Array<Album>, now: Date): Array<CardDetailItem> {
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const currentYear = now.getFullYear();

	return albums
		.map((album): OnThisDayCandidate | null => {
			if (!album.releaseDate || !album.name.trim() || !album.artistName.trim()) {
				return null;
			}

			const originalReleaseDate = new Date(album.releaseDate);
			if (Number.isNaN(originalReleaseDate.getTime())) {
				return null;
			}

			const originalReleaseYear = originalReleaseDate.getFullYear();
			if (originalReleaseYear >= currentYear) {
				return null;
			}

			if (originalReleaseDate.getMonth() + 1 !== month || originalReleaseDate.getDate() !== day) {
				return null;
			}

			return {
				album,
				originalReleaseDate,
				originalReleaseYear,
			};
		})
		.filter((candidate): candidate is OnThisDayCandidate => candidate !== null)
		.sort((left, right) => {
			if (left.originalReleaseYear !== right.originalReleaseYear) {
				return left.originalReleaseYear - right.originalReleaseYear;
			}

			const byName = left.album.name.localeCompare(right.album.name);
			if (byName !== 0) {
				return byName;
			}

			return left.originalReleaseDate.getTime() - right.originalReleaseDate.getTime();
		})
		.map(({ album, originalReleaseYear }) => {
			const yearsAgo = currentYear - originalReleaseYear;
			const yearsAgoText = yearsAgo === 1 ? '1 YEAR AGO' : `${yearsAgo} YEARS AGO`;

			return {
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				lineOne: yearsAgoText,
				lineThree: album.artistName,
				lineTwo: album.name,
			};
		});
}
