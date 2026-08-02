import { appServices } from 'atolla/src/services/AppServices';
import { theme } from 'atolla/src/theme';
import { Button, ButtonType } from 'atolla/src/ui/components/Button';
import { ModalBase, modalStyles } from 'atolla/src/ui/components/ModalBase';
import { Toggle } from 'atolla/src/ui/components/Toggle';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { toastStories } from './toast.stories';

export interface DevGalleryViewModel {
	onClose: () => void;
}

interface DevGalleryState {
	revision: number;
}

// Dev-only toast harness: a modal card with a button per toast story that fires the real toastService,
// so the actual pill animates in over this gallery through the production slot. The animations toggle
// flips the real preference, letting the spring in/out be reviewed both on and off. Lives in
// //atolla_dev, so none of it reaches the released build.
export class DevGalleryView extends StatefulComponent<DevGalleryViewModel, DevGalleryState> {
	private readonly runHandlers = new Map<string, () => void>();

	state: DevGalleryState = { revision: 0 };

	onCreate(): void {
		const services = appServices.get();
		if (services) {
			this.registerDisposable(services.preferences.subscribe(this.bump));
		}
	}

	onRender(): void {
		const services = appServices.get();
		const animationsEnabled = services?.preferences.animationsEnabled ?? true;

		<ModalBase
			accessibilityId='dev-gallery'
			backdropAccessibilityId='dev-gallery-backdrop'
			onDismiss={this.viewModel.onClose}
		>
			<label style={modalStyles.title} value='TOAST GALLERY' />
			<view style={modalStyles.divider} />
			{toastStories.map((story) => (
				<view style={styles.storyRow}>
					<Button
						accessibilityId={story.accessibilityId}
						label={story.label}
						onTap={this.getRunHandler(story.accessibilityId)}
						style={ButtonType.Secondary}
					/>
				</view>
			))}
			<view style={styles.controlRow}>
				<label style={styles.controlLabel} value='animations' />
				<Toggle
					accessibilityId='dev-gallery-animations'
					enabled={animationsEnabled}
					onToggle={this.handleAnimationsToggle}
				/>
			</view>
			<view style={styles.storyRow}>
				<Button
					accessibilityId='dev-gallery-dismiss'
					label='dismiss current'
					onTap={this.handleDismissCurrent}
					style={ButtonType.Secondary}
				/>
			</view>
			<Button accessibilityId='dev-gallery-close' label='close' onTap={this.viewModel.onClose} />
		</ModalBase>;
	}

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private getRunHandler = (accessibilityId: string): (() => void) => {
		const existing = this.runHandlers.get(accessibilityId);
		if (existing) {
			return existing;
		}

		const story = toastStories.find((candidate) => candidate.accessibilityId === accessibilityId);
		const handler = (): void => {
			const services = appServices.get();
			if (services && story) {
				story.run(services);
			}
		};
		this.runHandlers.set(accessibilityId, handler);
		return handler;
	};

	private handleAnimationsToggle = (enabled: boolean): void => {
		void appServices.get()?.preferences.setAnimationsEnabled(enabled);
	};

	private handleDismissCurrent = (): void => {
		appServices.get()?.toastService.startClose();
	};
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
	storyRow: new Style<View>({
		marginBottom: 8,
	}),
};
