import { appServices } from 'atolla/src/services/AppServices';
import { theme } from 'atolla/src/theme';
import { Button, ButtonType } from 'atolla/src/ui/components/Button';
import { ModalBase, modalStyles } from 'atolla/src/ui/components/ModalBase';
import { Toggle } from 'atolla/src/ui/components/Toggle';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { animationStories } from './animationStories';

const defaultSize = 24;
const stageSizes = [24, 48, 96];

export interface DevAnimationGalleryViewModel {
	onClose: () => void;
}

interface DevAnimationGalleryState {
	revision: number;
	size: number;
	stageMounted: boolean;
	storyId: string;
}

// Dev-only animation harness: a modal card with a preview stage and a button per story, so every
// animation can be watched on demand instead of by forcing the action that triggers it. The
// animations toggle flips the real preference, so each story can be reviewed both on and off. Lives
// in //atolla_dev, so none of it reaches the released build.
export class DevAnimationGalleryView extends StatefulComponent<
	DevAnimationGalleryViewModel,
	DevAnimationGalleryState
> {
	private readonly sizeHandlers = new Map<number, () => void>();
	private readonly storyHandlers = new Map<string, () => void>();
	private remountTimer?: ReturnType<typeof setTimeout>;

	state: DevAnimationGalleryState = {
		revision: 0,
		size: defaultSize,
		stageMounted: false,
		storyId: '',
	};

	onCreate(): void {
		const services = appServices.get();
		if (services) {
			this.registerDisposable(services.preferences.subscribe(this.bump));
		}
	}

	onDestroy(): void {
		if (this.remountTimer) {
			clearTimeout(this.remountTimer);
		}
	}

	onRender(): void {
		const services = appServices.get();
		const animationsEnabled = services?.preferences.animationsEnabled ?? true;
		const { size, stageMounted, storyId } = this.state;
		const activeStory = animationStories.find((story) => story.accessibilityId === storyId);

		<ModalBase
			accessibilityId='dev-animation-gallery'
			backdropAccessibilityId='dev-animation-gallery-backdrop'
			onDismiss={this.viewModel.onClose}
		>
			<label style={modalStyles.title} value='ANIMATION GALLERY' />
			<view style={modalStyles.divider} />
			<view style={styles.stage}>
				{activeStory && stageMounted && activeStory.render(animationsEnabled, size)}
				{!activeStory && <label style={styles.stageHint} value='pick a story' />}
			</view>
			{activeStory?.sizeable && (
				<view style={styles.sizeRow}>
					<label style={styles.controlLabel} value='size' />
					{stageSizes.map((candidate) => (
						<view style={styles.sizeCell}>
							<Button
								accessibilityId={`dev-animation-size-${candidate}`}
								label={`${candidate}`}
								onTap={this.getSizeHandler(candidate)}
								style={candidate === size ? ButtonType.Primary : ButtonType.Secondary}
							/>
						</view>
					))}
				</view>
			)}
			<view style={modalStyles.divider} />
			{animationStories.map((story) => (
				<view style={styles.storyRow}>
					<Button
						accessibilityId={story.accessibilityId}
						label={story.label}
						onTap={this.getStoryHandler(story.accessibilityId)}
						style={story.accessibilityId === storyId ? ButtonType.Primary : ButtonType.Secondary}
					/>
				</view>
			))}
			<view style={styles.controlRow}>
				<label style={styles.controlLabel} value='animations' />
				<Toggle
					accessibilityId='dev-animation-gallery-animations'
					enabled={animationsEnabled}
					onToggle={this.handleAnimationsToggle}
				/>
			</view>
			<Button
				accessibilityId='dev-animation-gallery-close'
				label='close'
				onTap={this.viewModel.onClose}
			/>
		</ModalBase>;
	}

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private getSizeHandler = (size: number): (() => void) => {
		const existing = this.sizeHandlers.get(size);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			this.restage(this.state.storyId, size);
		};
		this.sizeHandlers.set(size, handler);
		return handler;
	};

	private getStoryHandler = (accessibilityId: string): (() => void) => {
		const existing = this.storyHandlers.get(accessibilityId);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			this.restage(accessibilityId, this.state.size);
		};
		this.storyHandlers.set(accessibilityId, handler);
		return handler;
	};

	private handleAnimationsToggle = (enabled: boolean): void => {
		void appServices.get()?.preferences.setAnimationsEnabled(enabled);
	};

	// unmounts the stage for a frame before mounting it again, so the story starts from scratch.
	// DownloadedTick latches its completion for the life of the instance, so a re-render alone
	// would leave it sitting on its final frame — replaying it takes a fresh component.
	private restage(storyId: string, size: number): void {
		if (this.remountTimer) {
			clearTimeout(this.remountTimer);
		}

		this.setState({ size, stageMounted: false, storyId });
		this.remountTimer = setTimeout(() => {
			this.setState({ stageMounted: true });
		}, 0);
	}
}

const styles = {
	controlLabel: new Style<Label>({
		...theme.text.main,
	}),
	controlRow: new Style<View>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 10,
		marginTop: 6,
	}),
	sizeCell: new Style<View>({
		flexGrow: 1,
		marginLeft: 8,
	}),
	sizeRow: new Style<View>({
		alignItems: 'center',
		flexDirection: 'row',
		marginBottom: 8,
	}),
	stage: new Style<View>({
		alignItems: 'center',
		height: 120,
		justifyContent: 'center',
		width: '100%',
	}),
	stageHint: new Style<Label>({
		...theme.text.main,
		color: theme.colors.muted,
	}),
	storyRow: new Style<View>({
		marginBottom: 8,
	}),
};
