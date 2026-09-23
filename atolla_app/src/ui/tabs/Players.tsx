import { Component } from 'valdi_core/src/Component';
import { PlayersView, type PlayersViewModel } from '../views/PlayersView';

export interface PlayersTabViewModel extends PlayersViewModel {}

export class PlayersTab extends Component<PlayersTabViewModel> {
	onRender(): void {
		<PlayersView
			language={this.viewModel.language}
			playersStore={this.viewModel.playersStore}
			preferences={this.viewModel.preferences}
		/>;
	}
}
