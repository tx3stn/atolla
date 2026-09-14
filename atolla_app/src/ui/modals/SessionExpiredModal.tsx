import Strings from 'atolla_app/src/Strings';
import type { InternalError } from 'atolla_core/src/utils/Errors';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import type { ToastService } from '../../services/ToastService';
import { theme } from '../../theme';
import { Button, ButtonType } from '../components/Button';
import { QuickConnectPanel } from '../components/QuickConnectPanel';
import { ModalBase, modalStyles } from './ModalBase';

export interface SessionExpiredModalViewModel {
	animationsEnabled?: boolean;
	errorMessage: InternalError<string> | null;
	isConnecting: boolean;
	onSignIn: () => void;
	onStayOffline: () => void;
	quickConnectCode: string | null;
	toastService: ToastService;
}

export class SessionExpiredModal extends Component<SessionExpiredModalViewModel> {
	onRender(): void {
		const signInStarted =
			this.viewModel.isConnecting ||
			this.viewModel.quickConnectCode != null ||
			this.viewModel.errorMessage != null;

		<ModalBase accessibilityId='session-expired-modal' onDismiss={this.viewModel.onStayOffline}>
			<label style={modalStyles.title} value={Strings.errorsAuthSessionExpired().toUpperCase()} />
			<view style={modalStyles.divider} />

			<label numberOfLines={4} style={styles.body} value={Strings.sessionExpiredModalBody()} />

			{signInStarted && (
				<QuickConnectPanel
					errorMessage={this.viewModel.errorMessage}
					isConnecting={this.viewModel.isConnecting}
					quickConnectCode={this.viewModel.quickConnectCode}
					toastService={this.viewModel.toastService}
				/>
			)}

			<layout style={styles.actions}>
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='session-expired-stay-offline'
						animationsEnabled={this.viewModel.animationsEnabled}
						label={Strings.sessionExpiredStayOffline()}
						onTap={this.viewModel.onStayOffline}
						style={ButtonType.Secondary}
					/>
				</layout>
				<layout style={modalStyles.actionSeparator} />
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='session-expired-sign-in'
						animationsEnabled={this.viewModel.animationsEnabled}
						enabled={!this.viewModel.isConnecting}
						label={Strings.sessionExpiredSignIn()}
						onTap={this.viewModel.onSignIn}
						style={ButtonType.Confirm}
					/>
				</layout>
			</layout>
		</ModalBase>;
	}
}

const styles = {
	actions: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		marginTop: theme.scale(14),
	}),
	body: new Style<Label>({
		...theme.text.sub,
		marginBottom: theme.scale(4),
	}),
};
