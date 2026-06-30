import { Component } from 'valdi_core/src/Component';
import { SettingsView, type SettingsViewModel } from '../views/SettingsView';

export interface SettingsTabViewModel extends SettingsViewModel {}

export class SettingsTab extends Component<SettingsTabViewModel> {
	onRender(): void {
		<SettingsView
			downloadService={this.viewModel.downloadService}
			modalSlot={this.viewModel.modalSlot}
			paletteService={this.viewModel.paletteService}
			playbackOrchestrator={this.viewModel.playbackOrchestrator}
			preferences={this.viewModel.preferences}
			sessionController={this.viewModel.sessionController}
			toastService={this.viewModel.toastService}
			visible={this.viewModel.visible}
		/>;
	}
}
