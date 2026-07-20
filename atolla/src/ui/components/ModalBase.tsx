import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface ModalBaseViewModel {
	accessibilityId?: string;
	backdropAccessibilityId?: string;
	cardStyle?: Style<View>;
	onDismiss: () => void;
}

export class ModalBase extends Component<ModalBaseViewModel> {
	private stopPropagation = (): void => {};

	onRender(): void {
		const { accessibilityId, backdropAccessibilityId, cardStyle, onDismiss } = this.viewModel;

		<blur
			accessibilityId={backdropAccessibilityId}
			accessibilityLabel={backdropAccessibilityId}
			blurStyle={theme.modalBlurStyle}
			onTap={onDismiss}
			style={styles.backdrop}
		>
			<view onTap={onDismiss} style={styles.centeredContainer}>
				<view
					accessibilityId={accessibilityId}
					accessibilityLabel={accessibilityId}
					onTap={this.stopPropagation}
					style={cardStyle ?? styles.card}
				>
					<slot />
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	backdrop: new Style<BlurView>({
		backgroundColor: theme.modalBackdropColor,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		padding: 20,
		slowClipping: true,
		width: '90%',
	}),
	centeredContainer: new Style<Layout>({
		alignItems: 'center',
		flexGrow: 1,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
};

export const modalStyles = {
	actionButton: new Style<Layout>({
		flexBasis: 0,
		flexGrow: 1,
	}),
	actionSeparator: new Style<Layout>({
		width: 10,
	}),
	actions: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
	}),
	divider: new Style<View>({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 12,
		width: '100%',
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
