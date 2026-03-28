// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ClearCacheSelection } from '../../services/ImageCache';
import { theme } from '../../theme';

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
	private toggleAlbumArtBlurred = () => this.setState({ albumArtBlurred: !this.state.albumArtBlurred });
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
				<view onTap={this.stopPropagation} style={styles.card} testID='cache-clear-modal'>
					<label style={styles.title} value='Clear Cache' />
					<view style={styles.divider} />

					<view onTap={this.toggleAlbumArt} style={styles.row} testID='cache-clear-album-art-row'>
						<view style={albumArt ? styles.checkboxChecked : styles.checkboxUnchecked}>
							{albumArt && <label style={styles.checkmark} value='✓' />}
						</view>
						<label style={styles.rowLabel} value='Album Art' />
					</view>

					<view onTap={this.toggleAlbumArtBlurred} style={styles.row} testID='cache-clear-album-art-blurred-row'>
						<view style={albumArtBlurred ? styles.checkboxChecked : styles.checkboxUnchecked}>
							{albumArtBlurred && <label style={styles.checkmark} value='✓' />}
						</view>
						<label style={styles.rowLabel} value='Blurred Album Art' />
					</view>

					<view
						onTap={this.toggleArtistImage}
						style={styles.row}
						testID='cache-clear-artist-image-row'
					>
						<view style={artistImage ? styles.checkboxChecked : styles.checkboxUnchecked}>
							{artistImage && <label style={styles.checkmark} value='✓' />}
						</view>
						<label style={styles.rowLabel} value='Artist Images' />
					</view>

					<view
						onTap={this.toggleArtistLogo}
						style={styles.row}
						testID='cache-clear-artist-logo-row'
					>
						<view style={artistLogo ? styles.checkboxChecked : styles.checkboxUnchecked}>
							{artistLogo && <label style={styles.checkmark} value='✓' />}
						</view>
						<label style={styles.rowLabel} value='Artist Logos' />
					</view>

					<view
						onTap={this.togglePlaylistImage}
						style={styles.row}
						testID='cache-clear-playlist-image-row'
					>
						<view style={playlistImage ? styles.checkboxChecked : styles.checkboxUnchecked}>
							{playlistImage && <label style={styles.checkmark} value='✓' />}
						</view>
						<label style={styles.rowLabel} value='Playlist Images' />
					</view>

					<view style={styles.divider} />

					<view style={styles.actions}>
						<view
							onTap={anySelected ? this.handleConfirm : undefined}
							style={anySelected ? styles.confirmButton : styles.confirmButtonDisabled}
							testID='cache-clear-confirm-btn'
						>
							<label style={styles.actionLabel} value='Yes' />
						</view>
						<view style={styles.actionSeparator} />
						<view
							onTap={this.viewModel.onCancel}
							style={styles.cancelButton}
							testID='cache-clear-cancel-btn'
						>
							<label style={styles.actionLabel} value='No' />
						</view>
					</view>
				</view>
			</view>
		</blur>;
	}
}

const CHECKBOX_SIZE = 20;

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
	checkboxChecked: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: 4,
		height: CHECKBOX_SIZE,
		justifyContent: 'center',
		marginRight: 12,
		width: CHECKBOX_SIZE,
	}),
	checkboxUnchecked: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderColor: theme.colors.separator,
		borderRadius: 4,
		borderWidth: 1,
		height: CHECKBOX_SIZE,
		marginRight: 12,
		width: CHECKBOX_SIZE,
	}),
	checkmark: new Style({
		color: theme.colors.white,
		font: theme.text.sub.font,
		textAlign: 'center',
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
	row: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		paddingBottom: 10,
		paddingTop: 10,
	}),
	rowLabel: new Style<Label>({
		...theme.text.main,
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
