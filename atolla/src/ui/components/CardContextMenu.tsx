import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { startPagedPlayback } from '../../services/PagedPlayback';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import { singlePage, type TrackSource } from '../../services/TrackSource';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import { INSTANT_MIX_LIMIT, type InstantMixSeed, type Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';
import { ContextMenuActionRow } from './ContextMenuActionRow';
import { ModalBase } from './ModalBase';

export type CardContextMenuCard =
	| { kind: 'album'; album: Album }
	| { kind: 'artist'; artist: Artist }
	| { kind: 'genre'; genre: Genre }
	| { kind: 'playlist'; playlist: Playlist };

export interface CardContextMenuViewModel {
	animationsEnabled: boolean;
	card: CardContextMenuCard;
	isPinned: boolean;
	onAddToPlaylist?: (tracks: TrackSource) => void;
	onArtistTap?: () => void;
	onCreatePlaylist?: (tracks: TrackSource) => void;
	onDismiss: (toastMessage?: string) => void;
	onEntityTap?: () => void;
	onPin: () => void;
	onUnpin: () => void;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	transport: Transport;
}

interface CardContextMenuState {
	artistLogoUrl: string | null;
}

// large collections (genres, big playlists) stream their tracks into the queue a page at a time
// rather than materializing everything up front.
// play backfills as the queue drains, play next / add to queue take a single page
const TRACK_PAGE_SIZE = 50;

export class CardContextMenu extends StatefulComponent<
	CardContextMenuViewModel,
	CardContextMenuState
> {
	state: CardContextMenuState = {
		artistLogoUrl: null,
	};

	onCreate(): void {
		const { card } = this.viewModel;
		if (card.kind === 'album') {
			this.viewModel.transport.getArtistLogoUrl(card.album.artistId).then(
				(artistLogoUrl) => {
					if (!this.isDestroyed()) {
						this.setState({ artistLogoUrl });
					}
				},
				() => {},
			);
		} else if (card.kind === 'artist' && card.artist.logoUrl) {
			this.setState({ artistLogoUrl: card.artist.logoUrl });
		}
	}

	private instantMixSeed(): InstantMixSeed {
		const { card } = this.viewModel;
		switch (card.kind) {
			case 'album':
				return { id: card.album.id, kind: 'album' };
			case 'artist':
				return { id: card.artist.id, kind: 'artist' };
			case 'genre':
				return { id: card.genre.id, kind: 'genre' };
			case 'playlist':
				return { id: card.playlist.id, kind: 'playlist' };
		}
	}

	private trackSource(): TrackSource {
		const { card } = this.viewModel;
		switch (card.kind) {
			case 'album': {
				return singlePage(() => this.viewModel.transport.getTracksByAlbum(card.album.id));
			}
			case 'artist': {
				return singlePage(() => this.viewModel.transport.getTracksByArtist(card.artist.id));
			}
			case 'genre': {
				return (page, pageSize) =>
					this.viewModel.transport.getTracksByGenre(card.genre.id, page, pageSize);
			}
			case 'playlist': {
				return (page, pageSize) =>
					this.viewModel.transport.getTracksByPlaylist(card.playlist.id, page, pageSize);
			}
		}
	}

	private withPagedPage(tracks: TrackSource, action: (tracks: Array<Track>) => void): void {
		tracks(1, TRACK_PAGE_SIZE).then(
			({ items }) => {
				if (items.length === 0) return;
				action(items);
			},
			() => {},
		);
	}

	handlePlay = (): void => {
		const tracks = this.trackSource();
		if (this.viewModel.card.kind === 'album') {
			const album = this.viewModel.card.album;

			tracks(1, TRACK_PAGE_SIZE).then(
				({ items }) => {
					if (items.length > 0) this.viewModel.playbackStore.play(items, album);
				},
				() => {},
			);
		} else {
			startPagedPlayback(this.viewModel.playbackStore, tracks, TRACK_PAGE_SIZE);
		}

		this.viewModel.onDismiss();
	};

	handlePlayNext = (): void => {
		const { playbackStore } = this.viewModel;
		this.withPagedPage(this.trackSource(), (tracks) => playbackStore.playNext(tracks));
		this.viewModel.onDismiss(Strings.playingNextToast());
	};

	handleInstantMix = (): void => {
		const reportFailure = (): void => {
			this.viewModel.toastService.show({
				message: Strings.instantMixFailedToast(),
				variant: ToastTypes.error,
			});
		};

		this.viewModel.transport.getInstantMix(this.instantMixSeed(), INSTANT_MIX_LIMIT).then((mix) => {
			if (mix.length === 0) {
				reportFailure();
				return;
			}

			this.viewModel.playbackStore.playTracks(mix, 0);
		}, reportFailure);

		this.viewModel.onDismiss();
	};

	handleAddToQueue = (): void => {
		const { playbackStore } = this.viewModel;
		this.withPagedPage(this.trackSource(), (tracks) => playbackStore.addToQueue(tracks));
		this.viewModel.onDismiss(Strings.addedToQueueToast());
	};

	handleAddToPlaylist = (): void => {
		this.viewModel.onAddToPlaylist?.(this.trackSource());
		this.viewModel.onDismiss();
	};

	handleCreatePlaylist = (): void => {
		this.viewModel.onCreatePlaylist?.(this.trackSource());
		this.viewModel.onDismiss();
	};

	handlePinToggle = (): void => {
		if (this.viewModel.isPinned) {
			this.viewModel.onUnpin();
		} else {
			this.viewModel.onPin();
		}
		this.viewModel.onDismiss();
	};

	handleBackdropTap = (): void => {
		this.viewModel.onDismiss();
	};

	handleArtistTap = (): void => {
		if (this.viewModel.onArtistTap) {
			this.viewModel.onArtistTap();
		}
		this.viewModel.onDismiss();
	};

	handleEntityTap = (): void => {
		if (this.viewModel.onEntityTap) {
			this.viewModel.onEntityTap();
		}
		this.viewModel.onDismiss();
	};

	onRender(): void {
		const { animationsEnabled, card, isPinned, onCreatePlaylist } = this.viewModel;
		const { artistLogoUrl } = this.state;

		<ModalBase
			accessibilityId='card-context-menu'
			backdropAccessibilityId='card-context-backdrop'
			cardStyle={styles.card}
			onDismiss={this.handleBackdropTap}
		>
			{card.kind === 'album' && (
				<view onTap={this.handleArtistTap} style={styles.logoTapArea}>
					<ArtistLogo
						containerStyle={styles.logoContainer}
						fallbackText={card.album.artistName}
						logoSource={artistLogoUrl}
						logoStyle={styles.logoImage}
					/>
				</view>
			)}
			{card.kind === 'album' && (
				<view
					accessibilityId='card-context-menu-album'
					accessibilityLabel='card-context-menu-album'
					onTap={this.handleEntityTap}
					style={styles.entityRow}
				>
					<CachedImage
						category='album_art_thumb'
						style={styles.entityArtwork}
						url={card.album.imageUrl}
					/>
					<label numberOfLines={2} style={styles.entityLabel} value={card.album.name} />
				</view>
			)}
			{card.kind === 'artist' && (
				<view onTap={this.handleArtistTap} style={styles.logoTapArea}>
					<ArtistLogo
						containerStyle={styles.logoContainer}
						fallbackText={card.artist.name}
						logoSource={artistLogoUrl}
						logoStyle={styles.logoImage}
					/>
				</view>
			)}
			{card.kind === 'playlist' && (
				<view onTap={this.handleEntityTap} style={styles.entityRow}>
					<CachedImage
						category='playlist_image_thumb'
						style={styles.entityArtwork}
						url={card.playlist.imageUrl}
					/>
					<label numberOfLines={2} style={styles.entityLabel} value={card.playlist.name} />
				</view>
			)}
			{card.kind === 'genre' && (
				<view onTap={this.handleEntityTap} style={styles.entityRow}>
					<CachedImage
						category='genre_art'
						style={styles.entityArtwork}
						url={card.genre.imageUrl}
					/>
					<label numberOfLines={2} style={styles.entityLabel} value={card.genre.name} />
				</view>
			)}
			<view style={styles.divider} />
			<ContextMenuActionRow
				accessibilityId='card-context-play'
				animationsEnabled={animationsEnabled}
				icon={res.play}
				label={Strings.play()}
				onPress={this.handlePlay}
			/>
			<ContextMenuActionRow
				accessibilityId='card-context-play-next'
				animationsEnabled={animationsEnabled}
				icon={res.playnext}
				label={Strings.playNext()}
				onPress={this.handlePlayNext}
			/>
			<ContextMenuActionRow
				accessibilityId='card-context-add-to-queue'
				animationsEnabled={animationsEnabled}
				icon={res.addtoqueue}
				label={Strings.addToQueue()}
				onPress={this.handleAddToQueue}
			/>
			<ContextMenuActionRow
				accessibilityId='card-context-instant-mix'
				animationsEnabled={animationsEnabled}
				icon={res.instantmix}
				label={Strings.instantMix()}
				onPress={this.handleInstantMix}
			/>
			<ContextMenuActionRow
				accessibilityId='card-context-add-to-playlist'
				animationsEnabled={animationsEnabled}
				icon={res.addtoplaylist}
				label={Strings.addToPlaylist()}
				onPress={this.handleAddToPlaylist}
			/>
			{onCreatePlaylist && (
				<ContextMenuActionRow
					accessibilityId='card-context-create-playlist'
					animationsEnabled={animationsEnabled}
					icon={res.createnewplaylist}
					label={Strings.createNewPlaylist()}
					onPress={this.handleCreatePlaylist}
				/>
			)}
			<ContextMenuActionRow
				accessibilityId='card-context-pin'
				animationsEnabled={animationsEnabled}
				icon={res.pin}
				label={isPinned ? Strings.unpin() : Strings.pinToHome()}
				onPress={this.handlePinToggle}
			/>
		</ModalBase>;
	}
}

const styles = {
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		padding: theme.scale(16),
		slowClipping: true,
		width: '90%',
	}),
	divider: new Style<View>({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: theme.scale(8),
		marginTop: theme.scale(8),
		width: '100%',
	}),
	entityArtwork: new Style<ImageView>({
		borderRadius: theme.radius.card,
		height: theme.scale(40),
		marginRight: theme.scale(12),
		width: theme.scale(40),
	}),
	entityLabel: new Style<Label>({
		...theme.text.main,
		flexGrow: 1,
		flexShrink: 1,
	}),
	entityRow: new Style<View>({
		alignItems: 'center' as const,
		flexDirection: 'row' as const,
		marginBottom: theme.scale(4),
		paddingBottom: theme.scale(8),
		paddingLeft: theme.scale(10),
		paddingRight: theme.scale(12),
		paddingTop: theme.scale(8),
		width: '100%',
	}),
	logoContainer: new Style<View>({
		alignItems: 'center' as const,
		height: theme.scale(60),
		marginBottom: theme.scale(12),
		slowClipping: true,
		width: '100%',
	}),
	logoImage: new Style<ImageView>({
		height: '100%',
		objectFit: 'contain' as const,
		width: '100%',
	}),
	logoTapArea: new Style<View>({
		width: '100%',
	}),
};
