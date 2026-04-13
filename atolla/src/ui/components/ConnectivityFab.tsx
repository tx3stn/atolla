// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';

const TRANSITION_DISPLAY_MS = 2000;

export interface ConnectivityFabViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	hidden?: boolean;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
}

interface ConnectivityFabState {
	bandStage: number;
	displayMode: ConnectionMode;
	isTransitioning: boolean;
	transientMark: 'none' | 'wifi' | 'wifioff';
}

export class ConnectivityFab extends StatefulComponent<
	ConnectivityFabViewModel,
	ConnectivityFabState
> {
	private logoWrapRef = new ElementRef();
	private transitionTimerId?: ReturnType<typeof setTimeout>;
	private bandTimerIds: Array<ReturnType<typeof setTimeout>> = [];

	state: ConnectivityFabState = {
		bandStage: 0,
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
		if (this.transitionTimerId) {
			clearTimeout(this.transitionTimerId);
		}
		for (const timerId of this.bandTimerIds) {
			clearTimeout(timerId);
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

	private clearBandTimers(): void {
		for (const timerId of this.bandTimerIds) {
			clearTimeout(timerId);
		}
		this.bandTimerIds = [];
	}

	private animateWobble(): Promise<void> {
		if (!this.viewModel.animationsEnabled) {
			return Promise.resolve();
		}

		return this.animatePromise({ curve: 'easeOut', duration: 0.08 }, () => {
			this.logoWrapRef.setAttribute('left', -2);
		})
			.then(() => {
				return this.animatePromise({ curve: 'easeOut', duration: 0.08 }, () => {
					this.logoWrapRef.setAttribute('left', 2);
				});
			})
			.then(() => {
				return this.animatePromise({ curve: 'easeOut', duration: 0.08 }, () => {
					this.logoWrapRef.setAttribute('left', -1);
				});
			})
			.then(() => {
				return this.animatePromise({ curve: 'easeOut', duration: 0.07 }, () => {
					this.logoWrapRef.setAttribute('left', 0);
				});
			});
	}

	private animateWifiBands(): void {
		this.clearBandTimers();
		if (!this.viewModel.animationsEnabled) {
			this.setState({ bandStage: 3 });
			return;
		}

		this.setState({ bandStage: 1 });
		this.bandTimerIds.push(
			setTimeout(() => {
				this.setState({ bandStage: 2 });
			}, 180),
		);
		this.bandTimerIds.push(
			setTimeout(() => {
				this.setState({ bandStage: 3 });
			}, 360),
		);
	}

	private async playTransition(targetMode: ConnectionMode): Promise<void> {
		const target = this.resolveMode(targetMode);
		const transientMark = target === ConnectionModes.online ? 'wifi' : 'wifioff';

		this.setState({
			bandStage: transientMark === 'wifi' ? 1 : 0,
			displayMode: target,
			transientMark,
		});

		if (transientMark === 'wifi') {
			this.animateWifiBands();
		}

		void this.animateWobble();
		await this.wait(TRANSITION_DISPLAY_MS);
		this.clearBandTimers();
		this.setState({ bandStage: 0, transientMark: 'none' });
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
				if (success) {
					this.setState({
						displayMode: this.resolveMode(targetMode),
						isTransitioning: false,
					});
					return;
				}

				void this.playTransition(fromMode).then(() => {
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

		const isOffline = this.state.displayMode === ConnectionModes.offline;
		const showWifi = this.state.transientMark === 'wifi';
		const showWifiOff = this.state.transientMark === 'wifioff';
		const isEnabled = !this.state.isTransitioning;

		<view style={styles.root}>
			<view
				accessibilityLabel='connectivity-fab'
				contentDescription='connectivity-fab'
				onTap={isEnabled ? this.handleTap : undefined}
				style={styles.hitTarget}
			>
				<view
					ref={this.logoWrapRef}
					style={isOffline ? styles.logoWrapOffline : styles.logoWrapOnline}
				>
					<image src={res.logo} style={styles.logo} />
					{(showWifi || showWifiOff) && (
						<view style={styles.markFrame}>
							<view style={styles.markBackdrop} />
							{showWifi && (
								<view style={styles.markWifiFrame}>
									{this.state.bandStage >= 1 && (
										<view style={styles.bandMaskLow}>
											<image src={res.wifi} style={styles.markIcon} tint={theme.colors.white} />
										</view>
									)}
									{this.state.bandStage >= 2 && (
										<view style={styles.bandMaskMid}>
											<image src={res.wifi} style={styles.markIcon} tint={theme.colors.white} />
										</view>
									)}
									{this.state.bandStage >= 3 && (
										<image src={res.wifi} style={styles.markIcon} tint={theme.colors.white} />
									)}
								</view>
							)}
							{showWifiOff && (
								<image src={res.wifioff} style={styles.markIcon} tint={theme.colors.white} />
							)}
						</view>
					)}
				</view>
				{this.viewModel.downloadingCount > 0 && (
					<view style={styles.badge}>
						<label style={styles.badgeLabel} value={String(this.viewModel.downloadingCount)} />
					</view>
				)}
			</view>
		</view>;
	}
}

const styles = {
	badge: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: 999,
		justifyContent: 'center',
		minWidth: 22,
		padding: 3,
		position: 'absolute',
		right: -2,
		top: -1,
	}),
	badgeLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.white,
	}),
	bandMaskLow: new Style({
		height: 6,
		overflow: 'hidden',
		position: 'absolute',
		top: 8,
		width: 14,
	}),
	bandMaskMid: new Style({
		height: 10,
		overflow: 'hidden',
		position: 'absolute',
		top: 4,
		width: 14,
	}),
	hitTarget: new Style({
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
	logoWrapOffline: new Style({
		opacity: 0.62,
		position: 'relative',
	}),
	logoWrapOnline: new Style({
		opacity: 1,
		position: 'relative',
	}),
	markBackdrop: new Style({
		backgroundColor: 'rgba(8,16,30,0.78)',
		borderRadius: 999,
		height: 14,
		left: 0,
		position: 'absolute',
		top: 0,
		width: 14,
	}),
	markFrame: new Style({
		height: 14,
		left: 10,
		position: 'absolute',
		top: 8,
		width: 14,
	}),
	markIcon: new Style<ImageView>({
		height: 14,
		width: 14,
	}),
	markWifiFrame: new Style({
		height: 14,
		position: 'relative',
		width: 14,
	}),
	root: new Style({
		position: 'relative',
	}),
};
