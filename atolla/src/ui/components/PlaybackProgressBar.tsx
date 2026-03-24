// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { TouchEventState } from 'valdi_tsx/src/GestureEvents';

export interface PlaybackProgressBarViewModel {
	accentColor: string;
	accessibilityLabel?: string;
	onProgressTap?: (ratio?: number) => void;
	progressRatio: number;
	thickness?: number;
	trackColor: string;
}

export class PlaybackProgressBar extends Component<PlaybackProgressBarViewModel> {
	private minTouchAbsoluteX: number | null = null;
	private maxTouchAbsoluteX: number | null = null;
	private suppressTapUntilMs = 0;

	onRender(): void {
		const progressRatio = clamp(this.viewModel.progressRatio, 0, 1);
		const trackStyle = createTrackStyle(this.viewModel.thickness ?? 4);
		const railStyle = createRailStyle(this.viewModel.trackColor, this.viewModel.thickness ?? 4);
		const fillStyle = createFillStyle(this.viewModel.accentColor, progressRatio);
		const playheadStyle = createPlayheadStyle(
			this.viewModel.accentColor,
			this.viewModel.thickness ?? 4,
		);

		<view
			accessibilityLabel={this.viewModel.accessibilityLabel}
			contentDescription={this.viewModel.accessibilityLabel}
			style={styles.root}
			testID='playback-progress-bar'
		>
			<view
				onTap={
					this.viewModel.onProgressTap
						? createReusableCallback((event) => {
								if (Date.now() < this.suppressTapUntilMs) {
									return;
								}
								const ratio = extractTapRatio(event);
								this.viewModel.onProgressTap?.(ratio ?? undefined);
							})
						: undefined
				}
				onTouch={
					this.viewModel.onProgressTap
						? createReusableCallback((event) => {
								if (extractTouchState(event) !== TouchEventState.Ended) {
									return;
								}

								const absoluteX = extractAbsoluteX(event);
								if (absoluteX == null) {
									return;
								}

								this.minTouchAbsoluteX =
									this.minTouchAbsoluteX == null
										? absoluteX
										: Math.min(this.minTouchAbsoluteX, absoluteX);
								this.maxTouchAbsoluteX =
									this.maxTouchAbsoluteX == null
										? absoluteX
										: Math.max(this.maxTouchAbsoluteX, absoluteX);

								const ratio = this.computeRatioFromAbsoluteX(absoluteX);
								if (ratio == null) {
									return;
								}

								this.suppressTapUntilMs = Date.now() + 220;
								this.viewModel.onProgressTap?.(ratio);
							})
						: undefined
				}
				style={trackStyle}
				testID='playback-progress-track'
			>
				<view style={railStyle} testID='playback-progress-rail'>
					<view style={fillStyle} testID='playback-progress-fill'>
						{progressRatio > 0 && (
							<view style={playheadStyle} testID='playback-progress-playhead' />
						)}
					</view>
				</view>
			</view>
		</view>;
	}

	private computeRatioFromAbsoluteX(absoluteX: number): number | null {
		if (this.minTouchAbsoluteX == null || this.maxTouchAbsoluteX == null) {
			return null;
		}

		const span = this.maxTouchAbsoluteX - this.minTouchAbsoluteX;
		if (span < 90) {
			return null;
		}

		return clamp((absoluteX - this.minTouchAbsoluteX) / span, 0, 1);
	}
}

function createTrackStyle(thickness: number): Style {
	const clampedThickness = Math.max(2, thickness);
	const hitHeight = Math.max(24, clampedThickness + 10);
	return new Style({
		height: hitHeight,
		justifyContent: 'center',
		position: 'relative',
		width: '100%',
	});
}

function createRailStyle(trackColor: string, thickness: number): Style {
	const clampedThickness = Math.max(2, thickness);
	return new Style({
		backgroundColor: trackColor,
		borderRadius: clampedThickness / 2,
		height: clampedThickness,
		overflow: 'visible',
		width: '100%',
	});
}

function createFillStyle(accentColor: string, progressRatio: number): Style {
	return new Style({
		alignItems: 'flex-end',
		backgroundColor: accentColor,
		borderRadius: 999,
		display: 'flex',
		height: '100%',
		justifyContent: 'center',
		width: `${Math.round(progressRatio * 100)}%`,
	});
}

function createPlayheadStyle(accentColor: string, thickness: number): Style {
	const size = Math.max(10, thickness + 6);
	return new Style({
		backgroundColor: accentColor,
		borderColor: '#ffffff',
		borderRadius: size / 2,
		borderWidth: 1,
		height: size,
		marginRight: -size / 2,
		shadowColor: '#000000',
		shadowOffset: { height: 1, width: 0 },
		shadowOpacity: 0.25,
		shadowRadius: 2,
		width: size,
	});
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function extractTouchState(event: unknown): unknown {
	if (!event || typeof event !== 'object') {
		return undefined;
	}
	const payload = event as { state?: unknown; nativeEvent?: { state?: unknown } };
	return payload.state ?? payload.nativeEvent?.state;
}

function extractAbsoluteX(event: unknown): number | null {
	if (!event || typeof event !== 'object') {
		return null;
	}
	const payload = event as {
		absoluteX?: unknown;
		x?: unknown;
		nativeEvent?: { absoluteX?: unknown; x?: unknown };
	};

	if (typeof payload.absoluteX === 'number') {
		return payload.absoluteX;
	}
	if (typeof payload.nativeEvent?.absoluteX === 'number') {
		return payload.nativeEvent.absoluteX;
	}
	if (typeof payload.x === 'number') {
		return payload.x;
	}
	if (typeof payload.nativeEvent?.x === 'number') {
		return payload.nativeEvent.x;
	}

	return null;
}

function extractTapRatio(event: unknown): number | null {
	if (!event || typeof event !== 'object') {
		return null;
	}

	const payload = event as {
		ratio?: unknown;
		xRatio?: unknown;
		nativeEvent?: { ratio?: unknown; xRatio?: unknown };
	};

	if (typeof payload.ratio === 'number') {
		return clamp(payload.ratio, 0, 1);
	}
	if (typeof payload.xRatio === 'number') {
		return clamp(payload.xRatio, 0, 1);
	}
	if (typeof payload.nativeEvent?.ratio === 'number') {
		return clamp(payload.nativeEvent.ratio, 0, 1);
	}
	if (typeof payload.nativeEvent?.xRatio === 'number') {
		return clamp(payload.nativeEvent.xRatio, 0, 1);
	}

	return null;
}

const styles = {
	root: new Style({
		width: '100%',
	}),
};
