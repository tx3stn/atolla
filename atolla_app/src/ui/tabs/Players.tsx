import { Component } from 'valdi_core/src/Component';
import { PlayersView, type PlayersViewModel } from '../views/PlayersView';

export interface PlayersTabViewModel extends PlayersViewModel {}

export class PlayersTab extends Component<PlayersTabViewModel> {
	onRender(): void {
		<PlayersView
			active={this.viewModel.active}
			language={this.viewModel.language}
			modalSlot={this.viewModel.modalSlot}
			playersStore={this.viewModel.playersStore}
			preferences={this.viewModel.preferences}
			toastService={this.viewModel.toastService}
		/>;
	}
}
