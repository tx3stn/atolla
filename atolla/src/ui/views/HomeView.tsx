// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { ConnectivityFab } from '../components/ConnectivityFab';
import { TrackList, type TrackListEntry } from '../components/TrackList';

interface RecentPlayedEntry {
	playedAtMs: number;
	track: Track;
}

export interface HomeViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	gridColumns: number;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface HomeState {
	albums: Array<Album>;
	isFooterVisible: boolean;
	isLoadingAlbums: boolean;
	recentlyPlayed: Array<RecentPlayedEntry>;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private hasBeenDestroyed = false;
	private loadGeneration = 0;
	private lastObservedTrackId: string | null = null;
	private unsubscribePlayback?: () => void;

	state: HomeState = {
		albums: [],
		isFooterVisible: false,
		isLoadingAlbums: true,
		recentlyPlayed: [],
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			this.syncPlaybackState();
		});
		this.syncPlaybackState();
		this.loadAlbums();
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
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

		this.viewModel.transport
			.getAllAlbums()
			.then((albums) => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}

				this.setState({ albums, isLoadingAlbums: false });
			})
			.catch(() => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}

				this.setState({ albums: [], isLoadingAlbums: false });
			});
	}

	private syncPlaybackState(): void {
		const activeTrack = this.viewModel.playbackStore.track;
		const nextRecent = this.state.recentlyPlayed;

		if (activeTrack?.id && activeTrack.id !== this.lastObservedTrackId) {
			this.lastObservedTrackId = activeTrack.id;
			const nowMs = Date.now();
			const deduped = nextRecent.filter((entry) => entry.track.id !== activeTrack.id);
			deduped.unshift({ playedAtMs: nowMs, track: activeTrack });
			this.setState({
				isFooterVisible: this.viewModel.playbackStore.track !== null,
				recentlyPlayed: deduped.slice(0, 5),
			});
			return;
		}

		if (!activeTrack) {
			this.lastObservedTrackId = null;
		}

		this.setState({ isFooterVisible: this.viewModel.playbackStore.track !== null });
	}

	private createOnThisDayCards(): Array<Card> {
		const now = new Date();
		const month = now.getMonth() + 1;
		const day = now.getDate();
		const currentYear = now.getFullYear();

		return this.state.albums
			.filter((album) => {
				if (!album.releaseDate) {
					return false;
				}

				const parsed = new Date(album.releaseDate);
				if (Number.isNaN(parsed.getTime())) {
					return false;
				}

				const releaseYear = parsed.getFullYear();
				return (
					releaseYear < currentYear && parsed.getMonth() + 1 === month && parsed.getDate() === day
				);
			})
			.sort((left, right) => (right.releaseDate ?? '').localeCompare(left.releaseDate ?? ''))
			.map((album) => ({
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				primaryText: album.name,
				secondaryText: album.releaseDate ? album.releaseDate.slice(0, 4) : album.artistName,
			}));
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
		return [...this.state.recentlyPlayed]
			.sort((left, right) => right.playedAtMs - left.playedAtMs)
			.map((entry, index) => ({
				artworkSource: entry.track.albumImageUrl ?? null,
				id: entry.track.id,
				leadingLabel: String(index + 1),
				meta: entry.track.artistName ?? entry.track.albumName ?? '',
				title: entry.track.name,
				track: entry.track,
			}));
	}

	onRender(): void {
		const onThisDayCards = this.createOnThisDayCards();
		const recentlyAddedCards = this.createRecentlyAddedCards();
		const recentlyPlayedTracks = this.createRecentlyPlayedEntries();

		<layout accessibilityLabel='home-view' contentDescription='home-view' style={styles.root}>
			<view style={styles.header}>
				<view style={styles.leadingFabSlot}>
					<ConnectivityFab
						animationsEnabled={this.viewModel.animationsEnabled}
						connectionMode={this.viewModel.connectionMode}
						downloadingCount={this.viewModel.downloadingCount}
						onRequestModeChange={this.viewModel.onRequestModeChange}
					/>
				</view>
			</view>

			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
				<layout style={styles.content}>
					{this.state.isLoadingAlbums ? (
						<label style={styles.emptyState} value='loading home' />
					) : (
						<layout style={styles.sections}>
							<layout style={styles.section}>
								<label style={styles.sectionTitle} value='ON THIS DAY' />
								{onThisDayCards.length > 0 ? (
									<CardGrid
										accessibilityLabel='home-on-this-day-grid'
										cards={onThisDayCards}
										columnCount={this.viewModel.gridColumns}
										onCardTap={() => {}}
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
									onCardTap={() => {}}
								/>
							</layout>

							<layout style={styles.section}>
								<label style={styles.sectionTitle} value='RECENTLY PLAYED' />
								{recentlyPlayedTracks.length > 0 ? (
									<TrackList tracks={recentlyPlayedTracks} />
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
	header: new Style({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	leadingFabSlot: new Style({
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingLeft: 6,
		paddingRight: 6,
		width: 60,
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
