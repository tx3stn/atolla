// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ClearCacheSelection } from '../../services/ImageCache';
import { theme } from '../../theme';
import { Checkbox } from './Checkbox';

export interface CacheClearModalViewModel {
	onCancel: () => void;
	onConfirm: (selection: ClearCacheSelection) => void;
}

interface CacheClearModalState {
	albumArt: boolean;
	albumArtBlurred: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	playlistImage: boolean;
}

export class CacheClearModal extends StatefulComponent<
	CacheClearModalViewModel,
	CacheClearModalState
> {
	state: CacheClearModalState = {
		albumArt: true,
		albumArtBlurred: true,
		artistImage: true,
		artistLogo: true,
		playlistImage: true,
	};

	private stopPropagation = () => {};

	private toggleArtistImage = () => this.setState({ artistImage: !this.state.artistImage });
	private toggleArtistLogo = () => this.setState({ artistLogo: !this.state.artistLogo });
	private toggleAlbumArt = () => this.setState({ albumArt: !this.state.albumArt });
	private toggleAlbumArtBlurred = () =>
		this.setState({ albumArtBlurred: !this.state.albumArtBlurred });
	private togglePlaylistImage = () => this.setState({ playlistImage: !this.state.playlistImage });

	private handleConfirm = () => {
		this.viewModel.onConfirm({
			albumArt: this.state.albumArt,
			albumArtBlurred: this.state.albumArtBlurred,
			artistImage: this.state.artistImage,
			artistLogo: this.state.artistLogo,
			playlistImage: this.state.playlistImage,
		});
	};

	onRender(): void {
		const { albumArt, albumArtBlurred, artistImage, artistLogo, playlistImage } = this.state;
		const anySelected = albumArt || albumArtBlurred || artistImage || artistLogo || playlistImage;

		<blur
			blurStyle='systemThickMaterialDark'
			onTap={this.viewModel.onCancel}
			style={styles.backdrop}
		>
			<view onTap={this.viewModel.onCancel} style={styles.centeredContainer}>
				<view
					accessibilityLabel='cache-clear-modal'
					contentDescription='cache-clear-modal'
					onTap={this.stopPropagation}
					style={styles.card}
				>
					<label style={styles.title} value='CLEAR CACHE' />
					<view style={styles.divider} />

					<Checkbox
						accessibilityLabel='cache-clear-album-art-row'
						checked={albumArt}
						label='album art'
						onToggle={this.toggleAlbumArt}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-album-art-blurred-row'
						checked={albumArtBlurred}
						label='blurred album art'
						onToggle={this.toggleAlbumArtBlurred}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-artist-image-row'
						checked={artistImage}
						label='artist images'
						onToggle={this.toggleArtistImage}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-artist-logo-row'
						checked={artistLogo}
						label='artist logos'
						onToggle={this.toggleArtistLogo}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-playlist-image-row'
						checked={playlistImage}
						label='playlist images'
						onToggle={this.togglePlaylistImage}
					/>

					<view style={styles.divider} />

					<view style={styles.actions}>
						<view
							accessibilityLabel='cache-clear-confirm-btn'
							contentDescription='cache-clear-confirm-btn'
							onTap={anySelected ? this.handleConfirm : undefined}
							style={anySelected ? styles.confirmButton : styles.confirmButtonDisabled}
						>
							<label style={styles.actionLabel} value='yes' />
						</view>
						<view style={styles.actionSeparator} />
						<view
							accessibilityLabel='cache-clear-cancel-btn'
							contentDescription='cache-clear-cancel-btn'
							onTap={this.viewModel.onCancel}
							style={styles.cancelButton}
						>
							<label style={styles.actionLabel} value='no' />
						</view>
					</view>
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	actionLabel: new Style({
		...theme.text.main,
		textAlign: 'center',
	}),
	actionSeparator: new Style({
		backgroundColor: theme.colors.separator,
		width: 1,
	}),
	actions: new Style({
		flexDirection: 'row',
	}),
	backdrop: new Style<BlurView>({
		backgroundColor: theme.colors.overlay,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	cancelButton: new Style({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	card: new Style({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		padding: 20,
		width: '90%',
	}),
	centeredContainer: new Style({
		alignItems: 'center',
		flex: 1,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
	confirmButton: new Style({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	confirmButtonDisabled: new Style({
		alignItems: 'center',
		opacity: 0.4,
		padding: 14,
		width: '50%',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 12,
		width: '100%',
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
