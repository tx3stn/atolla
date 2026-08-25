import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import type { Track } from 'atolla_core/src/models/Track';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { LyricsService } from '../../services/LyricsService';
import { theme } from '../../theme';
import { LyricsPanel, type LyricsStatus, LyricsStatuses } from '../components/LyricsPanel';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { ModalBase, modalStyles } from './ModalBase';

export interface LyricsModalViewModel {
	lyricsService: LyricsService;
	onDismiss: () => void;
	track: Track;
}

interface LyricsModalState {
	lyrics: Lyrics | null;
	status: LyricsStatus;
}

export class LyricsModal extends StatefulComponent<LyricsModalViewModel, LyricsModalState> {
	state: LyricsModalState = {
		lyrics: null,
		status: LyricsStatuses.loading,
	};

	private cachedPreviewEntry: Array<TrackListEntry> = [];
	private cachedPreviewEntrySource: Track | null = null;

	onCreate(): void {
		const { lyricsService, track } = this.viewModel;

		const resident = lyricsService.get(track.id);
		if (resident !== undefined) {
			this.setState({ lyrics: resident, status: LyricsStatuses.loaded });
			return;
		}

		lyricsService.load(track).then(
			(lyrics) => {
				if (!this.isDestroyed()) {
					this.setState({ lyrics, status: LyricsStatuses.loaded });
				}
			},
			() => {
				if (!this.isDestroyed()) {
					this.setState({ lyrics: null, status: LyricsStatuses.failed });
				}
			},
		);
	}

	onRender(): void {
		const { onDismiss, track } = this.viewModel;
		const { lyrics, status } = this.state;

		<ModalBase
			accessibilityId='lyrics-modal'
			backdropAccessibilityId='lyrics-modal-backdrop'
			cardStyle={styles.card}
			onDismiss={onDismiss}
		>
			<view accessibilityId='lyrics-modal-track' accessibilityLabel='lyrics-modal-track'>
				<TrackList tracks={this.getPreviewEntry(track)} />
			</view>
			<view style={modalStyles.divider} />
			<LyricsPanel
				accessibilityId='lyrics-modal-panel'
				bottomPadding={theme.scale(100)}
				horizontalPadding={theme.scale(14)}
				lyrics={lyrics}
				status={status}
				topPadding={0}
			/>
		</ModalBase>;
	}

	private getPreviewEntry(track: Track): Array<TrackListEntry> {
		if (track !== this.cachedPreviewEntrySource) {
			this.cachedPreviewEntrySource = track;
			this.cachedPreviewEntry = [
				{
					artworkSource: track.albumImageUrl ?? null,
					id: track.id,
					meta: track.artistName ?? track.albumName ?? '',
					title: track.name,
				},
			];
		}

		return this.cachedPreviewEntry;
	}
}

const styles = {
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		maxHeight: '80%',
		padding: theme.scale(16),
		slowClipping: true,
		width: '90%',
	}),
};
