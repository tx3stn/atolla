// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Image, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface ModalViewModel {
	body: string;
	logoUrl?: string;
	onClose: () => void;
	title: string;
}

export class Modal extends Component<ModalViewModel> {
	onRender(): void {
		const { body, logoUrl, onClose, title } = this.viewModel;

		<blur blurStyle='systemThickMaterialDark' onTap={onClose} style={styles.backdrop}>
			<view onTap={() => {}} style={styles.card}>
				{logoUrl && <image source={logoUrl} style={styles.logo} />}
				{!logoUrl && <label style={styles.title} value={title} />}
				<view style={styles.divider} />
				<scroll style={styles.scroll}>
					<label numberOfLines={0} style={styles.body} value={body} />
				</scroll>
			</view>
		</blur>;
	}
}

const styles = {
	backdrop: new Style<BlurView>({
		alignItems: 'center',
		backgroundColor: theme.colors.overlay,
		bottom: 0,
		height: '100%',
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 100,
	}),
	body: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
	}),
	card: new Style({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		maxHeight: '80%',
		overflow: 'hidden',
		padding: 20,
		width: '90%',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 12,
		width: '100%',
	}),
	logo: new Style<Image>({
		height: 40,
		objectFit: 'contain',
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
