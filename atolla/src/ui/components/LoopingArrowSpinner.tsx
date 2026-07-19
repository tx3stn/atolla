import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import type { SpinnerController } from './SpinnerController';

const stepsPerRevolution = 3;
const stepRadians = (Math.PI * 2) / stepsPerRevolution;
const defaultSecondsPerRevolution = 0.9;

export interface LoopingArrowSpinnerViewModel {
	accessibilityId?: string;
	controller?: SpinnerController;
	durationSeconds?: number;
	label?: string;
	size?: number;
	spinning?: boolean;
	tint?: string;
}

interface LoopingArrowSpinnerState {
	tick: number;
}

function isSpinning(viewModel: LoopingArrowSpinnerViewModel): boolean {
	return viewModel.spinning ?? true;
}

export class LoopingArrowSpinner extends StatefulComponent<
	LoopingArrowSpinnerViewModel,
	LoopingArrowSpinnerState
> {
	state: LoopingArrowSpinnerState = { tick: 0 };
	private ticker?: ReturnType<typeof setInterval>;
	private running = false;

	onCreate(): void {
		this.viewModel.controller?.attach({
			start: () => this.startSpinning(),
			stop: () => this.stopSpinning(),
		});
		if (isSpinning(this.viewModel)) {
			this.startSpinning();
		}
	}

	onDestroy(): void {
		this.viewModel.controller?.detach();
		this.stopSpinning();
	}

	onViewModelUpdate(previousViewModel?: LoopingArrowSpinnerViewModel): void {
		const wasSpinning = previousViewModel ? isSpinning(previousViewModel) : true;
		const nowSpinning = isSpinning(this.viewModel);
		if (wasSpinning === nowSpinning) {
			return;
		}
		if (nowSpinning) {
			this.startSpinning();
		} else {
			this.stopSpinning();
		}
	}

	onRender(): void {
		const accessibilityId = this.viewModel.accessibilityId ?? 'spinner';
		const label = this.viewModel.label;
		const size = this.viewModel.size ?? 24;
		const tint = this.viewModel.tint ?? theme.colors.active;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={label ? styles.root : getIconOnlyRootStyle(size)}
		>
			<image
				rotation={stepRadians * this.state.tick}
				src={res.loopingarrow}
				style={getSpinnerStyle(size)}
				tint={tint}
			/>
			{label && <label style={styles.label} value={label} />}
		</view>;
	}

	private advance(stepSeconds: number): void {
		this.setStateAnimated(
			{ tick: this.state.tick + 1 },
			{ curve: AnimationCurve.Linear, duration: stepSeconds },
		);
	}

	private startSpinning(): void {
		if (this.running) {
			return;
		}
		this.running = true;
		void Promise.resolve().then(() => {
			if (!this.running || this.isDestroyed()) {
				return;
			}
			const stepSeconds = this.stepSeconds();
			this.advance(stepSeconds);
			this.ticker = setInterval(() => {
				if (!this.running || this.isDestroyed()) {
					return;
				}
				this.advance(stepSeconds);
			}, stepSeconds * 1000);
		});
	}

	private stepSeconds(): number {
		const secondsPerRevolution = this.viewModel.durationSeconds ?? defaultSecondsPerRevolution;
		return secondsPerRevolution / stepsPerRevolution;
	}

	private stopSpinning(): void {
		this.running = false;
		if (this.ticker !== undefined) {
			clearInterval(this.ticker);
			this.ticker = undefined;
		}
		if (!this.isDestroyed() && this.state.tick !== 0) {
			this.setState({ tick: 0 });
		}
	}
}

const iconOnlyRootStyleCache = new Map<number, Style<View>>();
const spinnerStyleCache = new Map<number, Style<ImageView>>();

function getIconOnlyRootStyle(size: number): Style<View> {
	const existingStyle = iconOnlyRootStyleCache.get(size);
	if (existingStyle) {
		return existingStyle;
	}

	const createdStyle = new Style<View>({
		alignItems: 'center',
		height: size,
		justifyContent: 'center',
		width: size,
	});
	iconOnlyRootStyleCache.set(size, createdStyle);
	return createdStyle;
}

function getSpinnerStyle(size: number): Style<ImageView> {
	const existingStyle = spinnerStyleCache.get(size);
	if (existingStyle) {
		return existingStyle;
	}

	const createdStyle = new Style<ImageView>({
		height: size,
		width: size,
	});
	spinnerStyleCache.set(size, createdStyle);
	return createdStyle;
}

const styles = {
	label: new Style<Label>({
		...theme.text.sub,
		marginLeft: 8,
	}),
	root: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'center',
		paddingBottom: 8,
		paddingTop: 8,
	}),
};
