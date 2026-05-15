import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';
import { Modal } from './Modal';

export interface BioSectionViewModel {
	bio: string;
	logoUrl?: string;
	modalSlot?: DetachedSlot;
	title: string;
}

export class BioSection extends Component<BioSectionViewModel> {
	private closeModal = (): void => {
		this.viewModel.modalSlot?.slotted(this.renderEmptyModalSlot);
	};

	private openBioModal = (): void => {
		this.viewModel.modalSlot?.slotted(this.renderBioModal);
	};

	private renderBioModal = (): void => {
		const { bio, logoUrl, title } = this.viewModel;
		<Modal body={bio} logoUrl={logoUrl} onClose={this.closeModal} title={title} />;
	};

	private renderEmptyModalSlot = (): void => {};

	onRender(): void {
		const { bio } = this.viewModel;

		<layout style={styles.section}>
			<label style={styles.sectionHeader} value={Strings.bio()} />
			<view onTap={this.openBioModal}>
				<label numberOfLines={3} style={styles.bioText} textOverflow='ellipsis' value={bio} />
			</view>
		</layout>;
	}
}

const styles = {
	bioText: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
	}),
	section: new Style({
		marginBottom: 16,
		padding: 8,
		width: '100%',
	}),
	sectionHeader: new Style<Label>({
		...theme.text.mutedHeader,
		margin: 8,
	}),
};
