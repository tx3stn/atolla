import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { ImageCache } from '../../services/ImageCache';
import { theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Toast';
import { scheduleToastDismiss } from '../components/toastTimer';

export interface AddToPlaylistViewModel {
	animationsEnabled: boolean;
	gridColumns?: number;
	imageCache?: ImageCache;
	onDismiss: () => void;
	track: Track;
	transport: Transport;
}

interface AddToPlaylistState {
	errorMessage: string | null;
	isLoading: boolean;
	playlists: Array<Playlist>;
	toastMessage: string | null;
}

export class AddToPlaylistView extends StatefulComponent<
	AddToPlaylistViewModel,
	AddToPlaylistState
> {
	private hasBeenDestroyed = false;
	private toastTimerId?: ReturnType<typeof setTimeout>;

	state: AddToPlaylistState = {
		errorMessage: null,
		isLoading: true,
		playlists: [],
		toastMessage: null,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		void this.viewModel.transport
			.getAllPlaylists()
			.then((playlists) => {
				if (!this.hasBeenDestroyed) {
					this.setState({ isLoading: false, playlists });
				}
			})
			.catch(() => {
				if (!this.hasBeenDestroyed) {
					this.setState({ isLoading: false });
				}
			});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		if (this.toastTimerId) {
			clearTimeout(this.toastTimerId);
		}
	}

	handlePlaylistTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const { track, transport } = this.viewModel;
		if (!transport.addItemToPlaylist) return;

		void transport
			.addItemToPlaylist(card.id, track.id)
			.then(() => {
				if (this.hasBeenDestroyed) return;
				this.toastTimerId = scheduleToastDismiss(
					this.toastTimerId,
					(message) => {
						if (this.hasBeenDestroyed) return;
						this.setState({ toastMessage: message });
						if (message === null) this.viewModel.onDismiss();
					},
					Strings.addedToPlaylist(),
				);
			})
			.catch((e: unknown) => {
				if (this.hasBeenDestroyed) return;
				const message =
					e != null &&
					typeof e === 'object' &&
					'message' in e &&
					typeof (e as { message: unknown }).message === 'string'
						? (e as { message: string }).message
						: 'Unknown error';
				this.setState({ errorMessage: message });
			});
	};

	onRender(): void {
		const { onDismiss } = this.viewModel;
		const { errorMessage, playlists, toastMessage } = this.state;
		const gridColumns = this.viewModel.gridColumns ?? 2;

		const cards: Array<Card> = playlists.map((p) => ({
			artworkKey: p.imageUrl ?? '',
			id: p.id,
			kind: 'playlist',
			primaryText: p.name,
			secondaryText: '',
		}));

		<view accessibilityLabel='add-to-playlist-view' style={styles.root}>
			<scroll style={styles.scroll}>
				<CardGrid
					accessibilityLabel='add-to-playlist-grid'
					cards={cards}
					columnCount={gridColumns}
					onCardTap={this.handlePlaylistTap}
				/>
			</scroll>
			<view style={styles.header}>
				<label style={styles.title} value={Strings.addToPlaylist().toUpperCase()} />
				<view
					accessibilityLabel='add-to-playlist-close'
					onTap={onDismiss}
					style={styles.closeButton}
				>
					<label style={styles.closeLabel} value={Strings.done()} />
				</view>
			</view>
			{toastMessage && <Toast message={toastMessage} />}
			{errorMessage && (
				<Modal
					body={errorMessage}
					onClose={() => {
						this.setState({ errorMessage: null });
					}}
					title={Strings.playlistEditErrorTitle()}
				/>
			)}
		</view>;
	}
}

const styles = {
	closeButton: new Style<View>({
		padding: 8,
	}),
	closeLabel: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
	header: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgFrosted,
		flexDirection: 'row',
		justifyContent: 'space-between',
		left: 0,
		paddingBottom: 12,
		paddingLeft: 16,
		paddingRight: 16,
		paddingTop: topInset + 16,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 10,
	}),
	root: new Style<View>({
		backgroundColor: theme.colors.bg,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	scroll: new Style<ScrollView>({
		bottom: 0,
		left: 0,
		padding: 8,
		paddingBottom: 24,
		paddingTop: topInset + theme.headerHeight + 8,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	title: new Style<Label>({
		...theme.text.mutedHeader,
	}),
};
