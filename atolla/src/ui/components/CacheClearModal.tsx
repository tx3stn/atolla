import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import type { ClearCacheSelection } from '../../services/ImageCache';
import { theme } from '../../theme';
import { Checkbox } from './Checkbox';

export interface CacheClearModalCount {
	ready?: number;
	total: number;
}

export interface CacheClearModalCounts {
	albumArt?: CacheClearModalCount;
	albumArtBlurred?: CacheClearModalCount;
	artistImage?: CacheClearModalCount;
	artistLogo?: CacheClearModalCount;
	genreImage?: CacheClearModalCount;
	playlistImage?: CacheClearModalCount;
	tracks?: CacheClearModalCount;
	waveformData?: CacheClearModalCount;
}

export interface CacheClearModalViewModel {
	counts?: CacheClearModalCounts;
	onCancel: () => void;
	onConfirm: (selection: ClearCacheSelection) => void;
}

interface CacheClearModalState {
	albumArt: boolean;
	albumArtBlurred: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	genreImage: boolean;
	playlistImage: boolean;
	tracks: boolean;
	waveformData: boolean;
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
		genreImage: true,
		playlistImage: true,
		tracks: true,
		waveformData: true,
	};

	private stopPropagation = () => {};

	private toggleArtistImage = () => this.setState({ artistImage: !this.state.artistImage });
	private toggleArtistLogo = () => this.setState({ artistLogo: !this.state.artistLogo });
	private toggleAlbumArt = () => this.setState({ albumArt: !this.state.albumArt });
	private toggleAlbumArtBlurred = () =>
		this.setState({ albumArtBlurred: !this.state.albumArtBlurred });
	private toggleGenreImage = () => this.setState({ genreImage: !this.state.genreImage });
	private togglePlaylistImage = () => this.setState({ playlistImage: !this.state.playlistImage });
	private toggleTracks = () => this.setState({ tracks: !this.state.tracks });
	private toggleWaveformData = () => this.setState({ waveformData: !this.state.waveformData });

	private handleConfirm = () => {
		this.viewModel.onConfirm({
			albumArt: this.state.albumArt,
			albumArtBlurred: this.state.albumArtBlurred,
			artistImage: this.state.artistImage,
			artistLogo: this.state.artistLogo,
			genreImage: this.state.genreImage,
			playlistImage: this.state.playlistImage,
			tracks: this.state.tracks,
			waveformData: this.state.waveformData,
		});
	};

	private labelWithCount(label: string, count: CacheClearModalCount | undefined): string {
		if (count == null) return label;
		const suffix = count.ready != null ? `${count.ready}/${count.total}` : `${count.total}`;
		return `[ ${suffix} ] ${label}`;
	}

	onRender(): void {
		const {
			albumArt,
			albumArtBlurred,
			artistImage,
			artistLogo,
			genreImage,
			playlistImage,
			tracks,
			waveformData,
		} = this.state;
		const counts = this.viewModel.counts;
		const anySelected =
			albumArt ||
			albumArtBlurred ||
			artistImage ||
			artistLogo ||
			genreImage ||
			playlistImage ||
			tracks ||
			waveformData;

		<blur blurStyle={theme.modalBlurStyle} onTap={this.viewModel.onCancel} style={styles.backdrop}>
			<view onTap={this.viewModel.onCancel} style={styles.centeredContainer}>
				<view
					accessibilityLabel='cache-clear-modal'
					onTap={this.stopPropagation}
					style={styles.card}
				>
					<label style={styles.title} value={Strings.clearCacheModalTitle()} />
					<view style={styles.divider} />

					<Checkbox
						accessibilityLabel='cache-clear-album-art-row'
						checked={albumArt}
						label={this.labelWithCount(Strings.cacheCategoryAlbumArt(), counts?.albumArt)}
						onToggle={this.toggleAlbumArt}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-album-art-blurred-row'
						checked={albumArtBlurred}
						label={this.labelWithCount(
							Strings.cacheCategoryAlbumArtBlurred(),
							counts?.albumArtBlurred,
						)}
						onToggle={this.toggleAlbumArtBlurred}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-artist-image-row'
						checked={artistImage}
						label={this.labelWithCount(Strings.cacheCategoryArtistImages(), counts?.artistImage)}
						onToggle={this.toggleArtistImage}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-artist-logo-row'
						checked={artistLogo}
						label={this.labelWithCount(Strings.cacheCategoryArtistLogos(), counts?.artistLogo)}
						onToggle={this.toggleArtistLogo}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-playlist-image-row'
						checked={playlistImage}
						label={this.labelWithCount(
							Strings.cacheCategoryPlaylistImages(),
							counts?.playlistImage,
						)}
						onToggle={this.togglePlaylistImage}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-genre-image-row'
						checked={genreImage}
						label={this.labelWithCount(Strings.cacheCategoryGenreImages(), counts?.genreImage)}
						onToggle={this.toggleGenreImage}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-track-row'
						checked={tracks}
						label={this.labelWithCount(Strings.cacheCategoryTracks(), counts?.tracks)}
						onToggle={this.toggleTracks}
					/>
					<Checkbox
						accessibilityLabel='cache-clear-waveform-data-row'
						checked={waveformData}
						label={this.labelWithCount(Strings.cacheCategoryWaveformData(), counts?.waveformData)}
						onToggle={this.toggleWaveformData}
					/>

					<view style={styles.divider} />

					<view style={styles.actions}>
						<view
							accessibilityLabel='cache-clear-confirm-btn'
							onTap={anySelected ? this.handleConfirm : undefined}
							style={anySelected ? styles.confirmButton : styles.confirmButtonDisabled}
						>
							<label style={styles.actionLabel} value={Strings.yes()} />
						</view>
						<view style={styles.actionSeparator} />
						<view
							accessibilityLabel='cache-clear-cancel-btn'
							onTap={this.viewModel.onCancel}
							style={styles.cancelButton}
						>
							<label style={styles.actionLabel} value={Strings.no()} />
						</view>
					</view>
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	actionSeparator: new Style({
		backgroundColor: theme.colors.separator,
		width: 1,
	}),
	actions: new Style<Layout>({
		flexDirection: 'row',
	}),
	backdrop: new Style<BlurView>({
		backgroundColor: theme.modalBackdropColor,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	cancelButton: new Style<Layout>({
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
	centeredContainer: new Style<Layout>({
		alignItems: 'center',
		flexGrow: 1,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
	confirmButton: new Style<Layout>({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	confirmButtonDisabled: new Style({
		alignItems: 'center' as const,
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
