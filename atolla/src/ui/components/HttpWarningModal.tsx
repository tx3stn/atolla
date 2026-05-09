import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme, withAlpha } from '../../theme';

interface HttpWarningModalViewModel {
	onCancel: () => void;
	onConfirm: () => void;
}

export class HttpWarningModal extends Component<HttpWarningModalViewModel> {
	private stopPropagation = () => {};

	onRender(): void {
		<blur blurStyle={theme.modalBlurStyle} onTap={this.viewModel.onCancel} style={styles.backdrop}>
			<view onTap={this.viewModel.onCancel} style={styles.centeredContainer}>
				<view
					accessibilityLabel='http-warning-modal'
					onTap={this.stopPropagation}
					style={styles.card}
				>
					<label style={styles.title} value={Strings.httpWarningModalTitle().toUpperCase()} />
					<view style={styles.divider} />

					<view style={styles.callout}>
						<label
							numberOfLines={7}
							style={styles.calloutText}
							value={Strings.httpWarningModalBody()}
						/>
					</view>

					<view style={styles.divider} />

					<view style={styles.actions}>
						<view
							accessibilityLabel='http-warning-cancel-btn'
							onTap={this.viewModel.onCancel}
							style={styles.cancelButton}
						>
							<label style={styles.cancelLabel} value={Strings.httpWarningModalCancel()} />
						</view>
						<view style={styles.actionSeparator} />
						<view
							accessibilityLabel='http-warning-confirm-btn'
							onTap={this.viewModel.onConfirm}
							style={styles.confirmButton}
						>
							<label style={styles.confirmLabel} value={Strings.httpWarningModalConfirm()} />
						</view>
					</view>
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	actionSeparator: new Style({
		backgroundColor: theme.colors.separator,
		width: 1,
	}),
	actions: new Style<Layout>({
		flexDirection: 'row',
	}),
	backdrop: new Style<BlurView>({
		backgroundColor: theme.modalBackdropColor,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	callout: new Style({
		backgroundColor: withAlpha(theme.colors.warning, 0.12),
		borderColor: theme.colors.warning,
		borderLeftWidth: 3,
		borderRadius: 6,
		marginBottom: 4,
		padding: 12,
	}),
	calloutText: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.warning,
	}),
	cancelButton: new Style<Layout>({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	cancelLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	card: new Style({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		padding: 20,
		width: '90%',
	}),
	centeredContainer: new Style<Layout>({
		alignItems: 'center',
		flexGrow: 1,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
	confirmButton: new Style<Layout>({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	confirmLabel: new Style<Label>({
		...theme.text.main,
		color: theme.colors.warning,
		textAlign: 'center',
	}),
	divider: new Style({
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
