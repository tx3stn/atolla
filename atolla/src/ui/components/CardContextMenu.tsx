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
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
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
	onAddToPlaylist?: (tracks: Array<Track>) => void;
	onArtistTap?: () => void;
	onCreatePlaylist?: (tracks: Array<Track>) => void;
	onDismiss: (toastMessage?: string) => void;
	onEntityTap?: () => void;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface CardContextMenuState {
	artistLogoUrl: string | null;
}

export class CardContextMenu extends StatefulComponent<
	CardContextMenuViewModel,
	CardContextMenuState
> {
	state: CardContextMenuState = {
		artistLogoUrl: null,
	};

	onCreate(): void {
		const { card, transport } = this.viewModel;
		if (card.kind === 'album') {
			transport.getArtistLogoUrl(card.album.artistId).then((artistLogoUrl) => {
				if (!this.isDestroyed()) {
					this.setState({ artistLogoUrl });
				}
			});
		} else if (card.kind === 'artist' && card.artist.logoUrl) {
			this.setState({ artistLogoUrl: card.artist.logoUrl });
		}
	}

	private fetchTracks(): Promise<Array<Track>> {
		const { card, transport } = this.viewModel;
		switch (card.kind) {
			case 'album':
				return transport.getTracksByAlbum(card.album.id);
			case 'artist':
				return transport.getTracksByArtist(card.artist.id);
			case 'genre':
				return transport.getTracksByGenre(card.genre.id);
			case 'playlist':
				return transport.getTracksByPlaylist(card.playlist.id);
		}
	}

	handlePlay = (): void => {
		const { card, playbackStore } = this.viewModel;
		this.fetchTracks().then((tracks) => {
			if (tracks.length === 0) return;
			if (card.kind === 'album') {
				playbackStore.play(tracks, card.album);
			} else {
				playbackStore.playTracks(tracks);
			}
		});
		this.viewModel.onDismiss(Strings.playingNowToast());
	};

	handlePlayNext = (): void => {
		const { playbackStore } = this.viewModel;
		this.fetchTracks().then((tracks) => {
			if (tracks.length === 0) return;
			playbackStore.playNext(tracks);
		});
		this.viewModel.onDismiss(Strings.playingNextToast());
	};

	handleAddToQueue = (): void => {
		this.fetchTracks().then((tracks) => {
			if (tracks.length === 0) return;
			this.viewModel.playbackStore.addToQueue(tracks);
		});
		this.viewModel.onDismiss(Strings.addedToQueueToast());
	};

	handleAddToPlaylist = (): void => {
		this.fetchTracks().then((tracks) => {
			if (tracks.length === 0) return;
			this.viewModel.onAddToPlaylist?.(tracks);
		});
		this.viewModel.onDismiss();
	};

	handleCreatePlaylist = (): void => {
		this.fetchTracks().then((tracks) => {
			if (tracks.length === 0) return;
			this.viewModel.onCreatePlaylist?.(tracks);
		});
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
		const { animationsEnabled, card, onCreatePlaylist } = this.viewModel;
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
		</ModalBase>;
	}
}

const styles = {
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		padding: 16,
		slowClipping: true,
		width: '90%',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 8,
		marginTop: 8,
		width: '100%',
	}),
	entityArtwork: new Style<ImageView>({
		borderRadius: theme.radius.card,
		height: 40,
		marginRight: 12,
		width: 40,
	}),
	entityLabel: new Style<Label>({
		...theme.text.main,
		flexGrow: 1,
		flexShrink: 1,
	}),
	entityRow: new Style({
		alignItems: 'center' as const,
		flexDirection: 'row' as const,
		marginBottom: 4,
		paddingBottom: 8,
		paddingLeft: 10,
		paddingRight: 12,
		paddingTop: 8,
		width: '100%',
	}),
	logoContainer: new Style({
		alignItems: 'center' as const,
		height: 60,
		marginBottom: 12,
		slowClipping: true,
		width: '100%',
	}),
	logoImage: new Style({
		height: '100%',
		objectFit: 'contain' as const,
		width: '100%',
	}),
	logoTapArea: new Style({
		width: '100%',
	}),
};
