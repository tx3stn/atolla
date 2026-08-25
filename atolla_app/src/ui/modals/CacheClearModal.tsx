import Strings from 'atolla_core/src/Strings';
import type { ClearCacheSelection } from 'atolla_core/src/services/CacheClear';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Button, ButtonType } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { ModalBase, modalStyles } from './ModalBase';

export interface CacheClearModalCounts {
	albumArt: number;
	albumArtBlurred: number;
	artistImage: number;
	artistLogo: number;
	genreImage: number;
	lyrics: number;
	playlistImage: number;
	tracks: number;
	waveformData: number;
}

export interface CacheClearModalViewModel {
	animationsEnabled?: boolean;
	counts: CacheClearModalCounts;
	onCancel: () => void;
	onConfirm: (selection: ClearCacheSelection) => void;
}

interface CacheClearModalState {
	albumArt: boolean;
	albumArtBlurred: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	genreImage: boolean;
	lyrics: boolean;
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
		lyrics: true,
		playlistImage: true,
		tracks: true,
		waveformData: true,
	};

	private toggleArtistImage = () => this.setState({ artistImage: !this.state.artistImage });
	private toggleArtistLogo = () => this.setState({ artistLogo: !this.state.artistLogo });
	private toggleAlbumArt = () => this.setState({ albumArt: !this.state.albumArt });
	private toggleAlbumArtBlurred = () =>
		this.setState({ albumArtBlurred: !this.state.albumArtBlurred });
	private toggleGenreImage = () => this.setState({ genreImage: !this.state.genreImage });
	private toggleLyrics = () => this.setState({ lyrics: !this.state.lyrics });
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
			lyrics: this.state.lyrics,
			playlistImage: this.state.playlistImage,
			tracks: this.state.tracks,
			waveformData: this.state.waveformData,
		});
	};

	private labelWithCount(label: string, count: number): string {
		return `[ ${count} ] ${label}`;
	}

	onRender(): void {
		const {
			albumArt,
			albumArtBlurred,
			artistImage,
			artistLogo,
			genreImage,
			lyrics,
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
			lyrics ||
			playlistImage ||
			tracks ||
			waveformData;

		<ModalBase accessibilityId='cache-clear-modal' onDismiss={this.viewModel.onCancel}>
			<label style={modalStyles.title} value={Strings.clearCacheModalTitle()} />
			<view style={modalStyles.divider} />

			<Checkbox
				accessibilityId='cache-clear-album-art-row'
				checked={albumArt}
				label={this.labelWithCount(Strings.cacheCategoryAlbumArt(), counts.albumArt)}
				onToggle={this.toggleAlbumArt}
			/>
			<Checkbox
				accessibilityId='cache-clear-album-art-blurred-row'
				checked={albumArtBlurred}
				label={this.labelWithCount(Strings.cacheCategoryAlbumArtBlurred(), counts.albumArtBlurred)}
				onToggle={this.toggleAlbumArtBlurred}
			/>
			<Checkbox
				accessibilityId='cache-clear-artist-image-row'
				checked={artistImage}
				label={this.labelWithCount(Strings.cacheCategoryArtistImages(), counts.artistImage)}
				onToggle={this.toggleArtistImage}
			/>
			<Checkbox
				accessibilityId='cache-clear-artist-logo-row'
				checked={artistLogo}
				label={this.labelWithCount(Strings.cacheCategoryArtistLogos(), counts.artistLogo)}
				onToggle={this.toggleArtistLogo}
			/>
			<Checkbox
				accessibilityId='cache-clear-playlist-image-row'
				checked={playlistImage}
				label={this.labelWithCount(Strings.cacheCategoryPlaylistImages(), counts.playlistImage)}
				onToggle={this.togglePlaylistImage}
			/>
			<Checkbox
				accessibilityId='cache-clear-genre-image-row'
				checked={genreImage}
				label={this.labelWithCount(Strings.cacheCategoryGenreImages(), counts.genreImage)}
				onToggle={this.toggleGenreImage}
			/>
			<Checkbox
				accessibilityId='cache-clear-track-row'
				checked={tracks}
				label={this.labelWithCount(Strings.cacheCategoryTracks(), counts.tracks)}
				onToggle={this.toggleTracks}
			/>
			<Checkbox
				accessibilityId='cache-clear-lyrics-row'
				checked={lyrics}
				label={this.labelWithCount(Strings.cacheCategoryLyrics(), counts.lyrics)}
				onToggle={this.toggleLyrics}
			/>
			<Checkbox
				accessibilityId='cache-clear-waveform-data-row'
				checked={waveformData}
				label={this.labelWithCount(Strings.cacheCategoryWaveformData(), counts.waveformData)}
				onToggle={this.toggleWaveformData}
			/>

			<layout style={modalStyles.actions}>
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='cache-clear-cancel'
						animationsEnabled={this.viewModel.animationsEnabled}
						label={Strings.no()}
						onTap={this.viewModel.onCancel}
						style={ButtonType.Secondary}
					/>
				</layout>
				<layout style={modalStyles.actionSeparator} />
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='cache-clear-confirm'
						animationsEnabled={this.viewModel.animationsEnabled}
						enabled={anySelected}
						label={Strings.yes()}
						onTap={this.handleConfirm}
						style={ButtonType.Confirm}
					/>
				</layout>
			</layout>
		</ModalBase>;
	}
}
