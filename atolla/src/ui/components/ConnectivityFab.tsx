import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';

const TRANSITION_DISPLAY_MS = 2000;

export interface ConnectivityFabViewModel {
	connectionMode: ConnectionMode;
	hidden?: boolean;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
}

interface ConnectivityFabState {
	displayMode: ConnectionMode;
	isTransitioning: boolean;
	transientMark: 'none' | 'wifi';
}

export class ConnectivityFab extends StatefulComponent<
	ConnectivityFabViewModel,
	ConnectivityFabState
> {
	private transitionTimerId?: ReturnType<typeof setTimeout>;
	private destroyed = false;

	state: ConnectivityFabState = {
		displayMode: ConnectionModes.online,
		isTransitioning: false,
		transientMark: 'none',
	};

	onCreate(): void {
		this.setState({ displayMode: this.resolveMode(this.viewModel.connectionMode) });
	}

	onViewModelUpdate(prevViewModel: ConnectivityFabViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (this.state.isTransitioning) {
			return;
		}

		if (prevViewModel.connectionMode === this.viewModel.connectionMode) {
			return;
		}

		this.setState({ displayMode: this.resolveMode(this.viewModel.connectionMode) });
	}

	onDestroy(): void {
		this.destroyed = true;
		if (this.transitionTimerId) {
			clearTimeout(this.transitionTimerId);
		}
	}

	private resolveMode(mode: ConnectionMode): ConnectionMode {
		if (mode === ConnectionModes.offline) {
			return ConnectionModes.offline;
		}

		return ConnectionModes.online;
	}

	private wait(ms: number): Promise<void> {
		if (this.transitionTimerId) {
			clearTimeout(this.transitionTimerId);
		}

		return new Promise((resolve) => {
			this.transitionTimerId = setTimeout(resolve, ms);
		});
	}

	private async playTransition(targetMode: ConnectionMode): Promise<void> {
		const target = this.resolveMode(targetMode);

		if (target === ConnectionModes.online) {
			if (this.destroyed) return;
			this.setState({ displayMode: target, transientMark: 'wifi' });
			await this.wait(TRANSITION_DISPLAY_MS);
			if (this.destroyed) return;
			this.setState({ transientMark: 'none' });
		} else {
			if (this.destroyed) return;
			this.setState({ displayMode: target });
		}
	}

	private handleTap = (): void => {
		if (this.viewModel.hidden || this.state.isTransitioning) {
			return;
		}

		const fromMode = this.resolveMode(this.viewModel.connectionMode);
		const targetMode =
			fromMode === ConnectionModes.offline ? ConnectionModes.online : ConnectionModes.offline;

		this.setState({ isTransitioning: true });

		const requestPromise = this.viewModel
			.onRequestModeChange(targetMode)
			.then((success) => success === true)
			.catch(() => false);

		void this.playTransition(targetMode)
			.then(() => requestPromise)
			.then((success) => {
				if (this.destroyed) return;
				if (success) {
					this.setState({
						displayMode: this.resolveMode(targetMode),
						isTransitioning: false,
					});
					return;
				}

				void this.playTransition(fromMode).then(() => {
					if (this.destroyed) return;
					this.setState({
						displayMode: this.resolveMode(fromMode),
						isTransitioning: false,
					});
				});
			});
	};

	onRender() {
		if (this.viewModel.hidden) {
			return;
		}

		const { transientMark, displayMode } = this.state;
		const isOffline = displayMode === ConnectionModes.offline;
		const isEnabled = !this.state.isTransitioning;

		const logoSrc =
			transientMark === 'wifi' ? res.logowifion : isOffline ? res.logowifioff : res.logo;

		<view style={styles.root}>
			<view
				accessibilityId='connectivity-fab'
				accessibilityLabel='connectivity-fab'
				onTap={isEnabled ? this.handleTap : undefined}
				style={styles.hitTarget}
			>
				<view style={styles.logoWrap}>
					<image src={logoSrc} style={styles.logo} />
				</view>
			</view>
		</view>;
	}
}

const styles = {
	hitTarget: new Style<View>({
		alignItems: 'center',
		height: 46,
		justifyContent: 'center',
		overflow: 'visible',
		position: 'relative',
		width: 46,
	}),
	logo: new Style<ImageView>({
		height: 34,
		width: 34,
	}),
	logoWrap: new Style<View>({
		position: 'relative',
	}),
	root: new Style<View>({
		position: 'relative',
	}),
};
