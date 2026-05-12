import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

const fullTurnRadians = Math.PI * 2;

export interface LoopingArrowSpinnerViewModel {
	accessibilityId?: string;
	durationSeconds?: number;
	label?: string;
	size?: number;
	tint?: string;
}

export class LoopingArrowSpinner extends StatefulComponent<LoopingArrowSpinnerViewModel> {
	private spinnerRef = new ElementRef();
	private spinnerRunning = false;
	private spinnerAngle = 0;
	private startTimer?: ReturnType<typeof setTimeout>;

	onCreate(): void {
		this.startTimer = setTimeout(() => {
			this.startSpinner();
		}, 0);
	}

	onDestroy(): void {
		if (this.startTimer) {
			clearTimeout(this.startTimer);
		}
		this.stopSpinner();
	}

	private startSpinner(): void {
		if (this.spinnerRunning) {
			return;
		}

		this.spinnerRunning = true;
		this.spin();
	}

	private stopSpinner(): void {
		this.spinnerRunning = false;
		this.spinnerAngle = 0;
		this.spinnerRef.setAttribute('rotation', 0);
	}

	private spin(): void {
		if (!this.spinnerRunning) {
			return;
		}

		const duration = this.viewModel.durationSeconds ?? 0.9;
		const nextAngle = this.spinnerAngle + fullTurnRadians;

		this.animatePromise(
			{ beginFromCurrentState: true, curve: AnimationCurve.Linear, duration },
			() => {
				this.spinnerRef.setAttribute('rotation', nextAngle);
			},
		)
			.then(() => {
				this.spinnerAngle = nextAngle;
				this.spin();
			})
			.catch(() => {
				this.spinnerRunning = false;
			});
	}

	onRender(): void {
		const accessibilityId = this.viewModel.accessibilityId ?? 'spinner';
		const label = this.viewModel.label;
		const size = this.viewModel.size ?? 24;
		const tint = this.viewModel.tint ?? theme.colors.active;
		const hasLabel = Boolean(label);

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={hasLabel ? styles.root : getIconOnlyRootStyle(size)}
		>
			<image
				ref={this.spinnerRef}
				src={res.loopingarrow}
				style={getSpinnerStyle(size)}
				tint={tint}
			/>
			{label && <label style={styles.label} value={label} />}
		</view>;
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

	const createdStyle = new Style({
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
