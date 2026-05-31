import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme, withAlpha } from '../../theme';
import { ModalBase, modalStyles } from './ModalBase';

interface HttpWarningModalViewModel {
	onCancel: () => void;
	onConfirm: () => void;
}

export class HttpWarningModal extends Component<HttpWarningModalViewModel> {
	onRender(): void {
		<ModalBase accessibilityId='http-warning-modal' onDismiss={this.viewModel.onCancel}>
			<label style={modalStyles.title} value={Strings.httpWarningModalTitle().toUpperCase()} />
			<view style={modalStyles.divider} />

			<view style={styles.callout}>
				<label
					numberOfLines={7}
					style={styles.calloutText}
					value={Strings.httpWarningModalBody()}
				/>
			</view>

			<view style={modalStyles.divider} />

			<view style={modalStyles.actions}>
				<view
					accessibilityId='http-warning-cancel-btn'
					accessibilityLabel='http-warning-cancel-btn'
					onTap={this.viewModel.onCancel}
					style={modalStyles.actionButton}
				>
					<label style={modalStyles.actionLabel} value={Strings.httpWarningModalCancel()} />
				</view>
				<view style={modalStyles.actionSeparator} />
				<view
					accessibilityId='http-warning-confirm-btn'
					accessibilityLabel='http-warning-confirm-btn'
					onTap={this.viewModel.onConfirm}
					style={modalStyles.actionButton}
				>
					<label style={styles.confirmLabel} value={Strings.httpWarningModalConfirm()} />
				</view>
			</view>
		</ModalBase>;
	}
}

const styles = {
	callout: new Style({
		backgroundColor: withAlpha(theme.colors.warning, 0.12),
		borderColor: theme.colors.warning,
		borderLeftWidth: 3,
		borderRadius: theme.radius.card,
		marginBottom: 4,
		padding: 12,
	}),
	calloutText: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.warning,
	}),
	confirmLabel: new Style<Label>({
		...theme.text.main,
		color: theme.colors.warning,
		textAlign: 'center',
	}),
};
