import { Component } from 'valdi_core/src/Component';
import { SettingsView, type SettingsViewModel } from '../views/V2SettingsView';

export interface SettingsTabViewModel {
	settings: SettingsViewModel;
}

export class SettingsTab extends Component<SettingsTabViewModel> {
	onRender(): void {
		const settings = this.viewModel.settings;

		<SettingsView
			downloadService={settings.downloadService}
			modalSlot={settings.modalSlot}
			paletteService={settings.paletteService}
			playbackOrchestrator={settings.playbackOrchestrator}
			preferences={settings.preferences}
			sessionController={settings.sessionController}
			toastService={settings.toastService}
			visible={settings.visible}
		/>;
	}
}
