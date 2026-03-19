// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { Modal } from './Modal';

export interface BioSectionViewModel {
	bio: string;
	logoUrl?: string;
	modalSlot: DetachedSlot;
	title: string;
}

export class BioSection extends Component<BioSectionViewModel> {
	onRender(): void {
		const { bio, logoUrl, modalSlot, title } = this.viewModel;

		<layout style={styles.section}>
			<label style={styles.sectionHeader} value='BIO' />
			<view
				onTap={() => {
					modalSlot.slotted(() => {
						<Modal body={bio} logoUrl={logoUrl} onClose={() => modalSlot.slotted(() => {})} title={title} />;
					});
				}}
			>
				<label ellipsizeMode='tail' numberOfLines={3} style={styles.bioText} value={bio} />
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
