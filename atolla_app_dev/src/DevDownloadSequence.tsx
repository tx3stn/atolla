import type { DownloadState } from 'atolla_app/src/services/DownloadService';
import { ToastService } from 'atolla_app/src/services/ToastService';
import { DetailHeader } from 'atolla_app/src/ui/components/DetailHeader';
import { StatefulComponent } from 'valdi_core/src/Component';

const downloadingDuration = 1200;

export interface DevDownloadSequenceViewModel {
	animationsEnabled: boolean;
}

interface DevDownloadSequenceState {
	downloadState: DownloadState;
}

// Drives the real DetailHeader through the downloading -> downloaded prop transition that starts the
// tick, so the spinner/tick/static-icon handover can be reviewed without downloading anything. The
// header itself is production code — reimplementing its download cell here could show a flicker the
// app doesn't have, or hide one it does. No modalSlot is passed: the remove-download confirmation
// would open into the same slot this gallery occupies and replace it.
export class DevDownloadSequence extends StatefulComponent<
	DevDownloadSequenceViewModel,
	DevDownloadSequenceState
> {
	private readonly toastService = new ToastService();
	private readonly noop = (): void => {};
	private timer?: ReturnType<typeof setTimeout>;

	state: DevDownloadSequenceState = { downloadState: 'downloading' };

	onCreate(): void {
		this.timer = setTimeout(() => {
			this.setState({ downloadState: 'downloaded' });
		}, downloadingDuration);
	}

	onDestroy(): void {
		if (this.timer) {
			clearTimeout(this.timer);
		}
	}

	onRender(): void {
		<DetailHeader
			animationsEnabled={this.viewModel.animationsEnabled}
			artworkCategory='album_art'
			artworkSource={null}
			downloadState={this.state.downloadState}
			onAddToQueue={this.handleAddToQueue}
			onDownload={this.noop}
			onPlay={this.noop}
			onRemoveDownload={this.noop}
			onShuffle={this.noop}
			toastService={this.toastService}
		/>;
	}

	private handleAddToQueue = (): Promise<void> => {
		return Promise.resolve();
	};
}
