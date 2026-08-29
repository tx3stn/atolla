import Strings from 'atolla_app/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../theme';
import { Button } from '../ui/components/Button';
import { closeSlot, openSlot } from '../ui/flows/ModalSlotFlow';
import type { DevTools } from './DevTools';

export interface DevToolsSectionViewModel {
	devTools?: DevTools;
	modalSlot: DetachedSlot;
}

export class DevToolsSection extends Component<DevToolsSectionViewModel> {
	onRender(): void {
		if (!this.viewModel.devTools) {
			return;
		}

		<view>
			<label style={styles.sectionTitle} value={Strings.devToolsSection()} />
			<view style={styles.section}>
				<Button
					accessibilityId='settings-dev-animations'
					label={Strings.devToolsAnimationsButton()}
					onTap={this.handleOpenAnimationGallery}
				/>
				<Button
					accessibilityId='settings-dev-gallery'
					label={Strings.devToolsGalleryButton()}
					onTap={this.handleOpenToastGallery}
				/>
			</view>
		</view>;
	}

	private handleClose = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleOpenAnimationGallery = (): void => {
		const devTools = this.viewModel.devTools;
		if (!devTools) {
			return;
		}
		openSlot(this.viewModel.modalSlot, devTools.animationGalleryRenderer(this.handleClose));
	};

	private handleOpenToastGallery = (): void => {
		const devTools = this.viewModel.devTools;
		if (!devTools) {
			return;
		}
		openSlot(this.viewModel.modalSlot, devTools.toastGalleryRenderer(this.handleClose));
	};
}

const styles = {
	section: new Style<View>({
		marginBottom: 16,
		marginTop: 8,
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mutedHeader,
		letterSpacing: 1,
		marginBottom: 4,
		marginLeft: 4,
		marginRight: 4,
		marginTop: 4,
	}),
};
