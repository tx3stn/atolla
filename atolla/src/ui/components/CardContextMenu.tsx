import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, ImageView, Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';

export type CardContextMenuCard =
	| { kind: 'album'; album: Album }
	| { kind: 'artist'; artist: Artist }
	| { kind: 'genre'; genre: Genre }
	| { kind: 'playlist'; playlist: Playlist };

export interface CardContextMenuViewModel {
	animationsEnabled?: boolean;
	card: CardContextMenuCard;
	imageCache?: ImageCache;
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
	private hasBeenDestroyed = false;
	private actionRowHeight = 48;
	private actionRowWidth = 280;
	private playRippleRef = new ElementRef();
	private playNextRippleRef = new ElementRef();
	private addToQueueRippleRef = new ElementRef();
	private addToPlaylistRippleRef = new ElementRef();
	private createPlaylistRippleRef = new ElementRef();

	state: CardContextMenuState = {
		artistLogoUrl: null,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		const { card, transport } = this.viewModel;
		if (card.kind === 'album') {
			transport.getArtistLogoUrl(card.album.artistId).then((artistLogoUrl) => {
				if (!this.hasBeenDestroyed) {
					this.setState({ artistLogoUrl });
				}
			});
		} else if (card.kind === 'artist' && card.artist.logoUrl) {
			this.setState({ artistLogoUrl: card.artist.logoUrl });
		}
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
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
		this.fetchTracks().then((tracks) => {
			if (tracks.length === 0) return;
			this.viewModel.playbackStore.playNext(tracks);
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

	handlePlayTap = (): void => {
		this.runActionWithTapFeedback(this.handlePlay, this.playRippleRef);
	};

	handlePlayNextTap = (): void => {
		this.runActionWithTapFeedback(this.handlePlayNext, this.playNextRippleRef);
	};

	handleAddToQueueTap = (): void => {
		this.runActionWithTapFeedback(this.handleAddToQueue, this.addToQueueRippleRef);
	};

	handleAddToPlaylistTap = (): void => {
		this.runActionWithTapFeedback(this.handleAddToPlaylist, this.addToPlaylistRippleRef);
	};

	handleCreatePlaylistTap = (): void => {
		this.runActionWithTapFeedback(this.handleCreatePlaylist, this.createPlaylistRippleRef);
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

	handleActionRowLayout = (frame: { height: number; width: number }): void => {
		if (frame?.width > 0) {
			this.actionRowWidth = frame.width;
		}
		if (frame?.height > 0) {
			this.actionRowHeight = frame.height;
		}
	};

	private runActionWithTapFeedback(action: () => void, rippleRef: ElementRef): void {
		if (!this.viewModel.animationsEnabled) {
			action();
			return;
		}

		animateRowPressOverlay(this, rippleRef, this.actionRowWidth, this.actionRowHeight)
			.then(() => {
				action();
			})
			.catch(() => {
				action();
			});
	}

	onRender(): void {
		const { card, imageCache, onCreatePlaylist } = this.viewModel;
		const { artistLogoUrl } = this.state;

		<blur
			accessibilityId='card-context-backdrop'
			accessibilityLabel='card-context-backdrop'
			blurStyle={theme.modalBlurStyle}
			onTap={this.handleBackdropTap}
			style={styles.backdrop}
		>
			<layout style={styles.backdropCenter}>
				<view
					accessibilityId='card-context-menu'
					accessibilityLabel='card-context-menu'
					style={styles.card}
				>
					{card.kind === 'album' && (
						<view onTap={this.handleArtistTap} style={styles.logoTapArea}>
							<ArtistLogo
								containerStyle={styles.logoContainer}
								fallbackText={card.album.artistName}
								imageCache={imageCache}
								logoSource={artistLogoUrl}
								logoStyle={styles.logoImage}
							/>
						</view>
					)}
					{card.kind === 'album' && (
						<view onTap={this.handleEntityTap} style={styles.entityRow}>
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
								imageCache={imageCache}
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
					<view
						accessibilityId='card-context-play'
						accessibilityLabel='card-context-play'
						onLayout={this.handleActionRowLayout}
						onTap={this.handlePlayTap}
						style={styles.actionRow}
					>
						<view ref={this.playRippleRef} style={styles.actionRowRipple} />
						<image src={res.play} style={styles.icon} tint={theme.colors.muted} />
						<label style={styles.actionLabel} value={Strings.play()} />
					</view>
					<view
						accessibilityId='card-context-play-next'
						accessibilityLabel='card-context-play-next'
						onLayout={this.handleActionRowLayout}
						onTap={this.handlePlayNextTap}
						style={styles.actionRow}
					>
						<view ref={this.playNextRippleRef} style={styles.actionRowRipple} />
						<image src={res.playnext} style={styles.icon} tint={theme.colors.muted} />
						<label style={styles.actionLabel} value={Strings.playNext()} />
					</view>
					<view
						accessibilityId='card-context-add-to-queue'
						accessibilityLabel='card-context-add-to-queue'
						onLayout={this.handleActionRowLayout}
						onTap={this.handleAddToQueueTap}
						style={styles.actionRow}
					>
						<view ref={this.addToQueueRippleRef} style={styles.actionRowRipple} />
						<image src={res.addtoqueue} style={styles.icon} tint={theme.colors.muted} />
						<label style={styles.actionLabel} value={Strings.addToQueue()} />
					</view>
					<view
						accessibilityId='card-context-add-to-playlist'
						accessibilityLabel='card-context-add-to-playlist'
						onLayout={this.handleActionRowLayout}
						onTap={this.handleAddToPlaylistTap}
						style={styles.actionRow}
					>
						<view ref={this.addToPlaylistRippleRef} style={styles.actionRowRipple} />
						<image src={res.addtoplaylist} style={styles.icon} tint={theme.colors.muted} />
						<label style={styles.actionLabel} value={Strings.addToPlaylist()} />
					</view>
					{onCreatePlaylist && (
						<view
							accessibilityId='card-context-create-playlist'
							accessibilityLabel='card-context-create-playlist'
							onLayout={this.handleActionRowLayout}
							onTap={this.handleCreatePlaylistTap}
							style={styles.actionRow}
						>
							<view ref={this.createPlaylistRippleRef} style={styles.actionRowRipple} />
							<image src={res.createnewplaylist} style={styles.icon} tint={theme.colors.muted} />
							<label style={styles.actionLabel} value={Strings.createNewPlaylist()} />
						</view>
					)}
				</view>
			</layout>
		</blur>;
	}
}

interface Animatable {
	animatePromise(options: object, callback: () => void): Promise<void>;
}

async function animateRowPressOverlay(
	component: Animatable,
	ref: ElementRef,
	rowWidth: number,
	rowHeight: number,
): Promise<void> {
	const safeWidth = Math.max(1, rowWidth);
	const safeHeight = Math.max(1, rowHeight);
	const centerX = safeWidth / 2;
	const centerY = safeHeight / 2;
	const impactWidth = safeWidth * 0.2;
	const impactHeight = safeHeight * 0.45;

	ref.setAttribute('left', centerX);
	ref.setAttribute('top', centerY);
	ref.setAttribute('width', 0);
	ref.setAttribute('height', 0);
	ref.setAttribute('borderRadius', Math.max(2, safeHeight * 0.16));
	ref.setAttribute('opacity', 0);

	await component.animatePromise({ curve: AnimationCurve.EaseOut, duration: 0.04 }, () => {
		ref.setAttribute('left', centerX - impactWidth / 2);
		ref.setAttribute('top', centerY - impactHeight / 2);
		ref.setAttribute('width', impactWidth);
		ref.setAttribute('height', impactHeight);
		ref.setAttribute('borderRadius', Math.max(2, impactHeight * 0.25));
		ref.setAttribute('opacity', 0.26);
	});
	return await component.animatePromise({ curve: AnimationCurve.EaseOut, duration: 0.14 }, () => {
		ref.setAttribute('left', 0);
		ref.setAttribute('top', 0);
		ref.setAttribute('width', safeWidth);
		ref.setAttribute('height', safeHeight);
		ref.setAttribute('borderRadius', 0);
		ref.setAttribute('opacity', 0);
	});
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.subLarger,
	}),
	actionRow: new Style({
		...theme.text.subLarger,
		flexDirection: 'row' as const,
		padding: 4,
		position: 'relative' as const,
		width: '100%',
	}),
	actionRowRipple: new Style({
		backgroundColor: theme.colors.white,
		height: 0,
		left: 0,
		opacity: 0,
		position: 'absolute' as const,
		top: 0,
		width: 0,
		zIndex: 2,
	}),
	backdrop: new Style<BlurView>({
		backgroundColor: theme.modalBackdropColor,
		bottom: 0,
		height: '100%',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 100,
	}),
	backdropCenter: new Style<Layout>({
		alignItems: 'center',
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
	card: new Style({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
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
		borderRadius: 4,
		height: 40,
		marginRight: 12,
		width: 40,
	}),
	entityLabel: new Style<Label>({
		...theme.text.main,
	}),
	entityRow: new Style({
		alignItems: 'center' as const,
		flexDirection: 'row' as const,
		marginBottom: 4,
		paddingBottom: 8,
		paddingLeft: 10,
		paddingRight: 10,
		paddingTop: 8,
		width: '100%',
	}),
	icon: new Style<ImageView>({
		height: 18,
		margin: 10,
		width: 18,
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
