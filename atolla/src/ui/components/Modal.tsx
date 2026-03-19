// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface ModalViewModel {
	body: string;
	onClose: () => void;
	title: string;
}

export class Modal extends Component<ModalViewModel> {
	onRender(): void {
		const { body, onClose, title } = this.viewModel;

		<blur blurStyle='systemUltraThinMaterialDark' onTap={onClose} style={styles.backdrop}>
			<blur blurStyle='systemChromeMaterialDark' onTap={() => {}} style={styles.card}>
				<label style={styles.title} value={title} />
				<view style={styles.divider} />
				<scroll style={styles.scroll}>
					<label numberOfLines={0} style={styles.body} value={body} />
				</scroll>
			</blur>
		</blur>;
	}
}

const styles = {
	backdrop: new Style<BlurView>({
		alignItems: 'center',
		bottom: 0,
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	body: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
	}),
	card: new Style<BlurView>({
		backgroundColor: theme.colors.bgAccent,
		borderColor: 'rgba(255,255,255,0.08)',
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		maxHeight: '80%',
		overflow: 'hidden',
		padding: 20,
		width: '90%',
	}),
	divider: new Style({
		backgroundColor: 'rgba(255,255,255,0.08)',
		height: 1,
		marginBottom: 14,
		marginTop: 12,
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
