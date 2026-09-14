import Strings from 'atolla_app/src/Strings';
import { AuthErrors } from 'atolla_core/src/services/AuthErrors';
import type { InternalError } from 'atolla_core/src/utils/Errors';
import { JellyfinAuthErrors } from 'atolla_jellyfin/src/services/AuthErrors';
import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import { LoadingSpinner } from '../animations/LoadingSpinner';

export interface QuickConnectPanelViewModel {
	errorMessage: InternalError<string> | null;
	isConnecting: boolean;
	quickConnectCode: string | null;
	toastService: ToastService;
}

export class QuickConnectPanel extends Component<QuickConnectPanelViewModel> {
	onRender(): void {
		<view style={styles.root}>
			{this.viewModel.quickConnectCode && (
				<view
					accessibilityId='connection-quick-connect-code'
					onTap={this.copyQuickConnectCode}
					style={styles.codeSlot}
				>
					<label
						style={styles.code}
						value={Strings.quickConnectCode(this.viewModel.quickConnectCode)}
					/>
				</view>
			)}
			<view style={styles.spinnerSlot}>
				{this.viewModel.isConnecting && (
					<LoadingSpinner accessibilityId='waiting for quick connect' size={45} />
				)}
			</view>
			{this.viewModel.errorMessage && (
				<label style={styles.errorMessage} value={errorText(this.viewModel.errorMessage)} />
			)}
		</view>;
	}

	private copyQuickConnectCode = (): void => {
		const code = this.viewModel.quickConnectCode;
		if (code == null) {
			return;
		}

		hapticFeedback();
		Device.copyToClipBoard(code);
		this.viewModel.toastService.show({
			message: Strings.copiedToClipboard(),
			variant: ToastTypes.success,
		});
	};
}

const styles = {
	code: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.active,
		textAlign: 'center',
	}),
	codeSlot: new Style<View>({
		alignItems: 'center' as const,
		height: theme.scale(28),
		justifyContent: 'center' as const,
	}),
	errorMessage: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.destructive,
		marginTop: theme.scale(10),
		textAlign: 'center',
	}),
	root: new Style<View>({
		alignItems: 'center' as const,
		marginTop: theme.scale(10),
	}),
	spinnerSlot: new Style<View>({
		alignItems: 'center' as const,
		height: theme.scale(46),
		justifyContent: 'center' as const,
		marginTop: theme.scale(10),
	}),
};

function errorText(error: InternalError<string>): string {
	const message = messageForErrorCode(error.err);

	return error.detail === '' ? message : `${message}: ${error.detail}`;
}

function messageForErrorCode(code: string): string {
	switch (code) {
		case AuthErrors.CONNECTION_ERROR.err:
			return Strings.errorsAuthConnection();
		case AuthErrors.FAILED_TO_FETCH_DATA.err:
			return Strings.errorsAuthFailedToFetch();
		case AuthErrors.LOGIN_CANCELED.err:
			return Strings.errorsAuthLoginCanceled();
		case AuthErrors.SERVER_UNREACHABLE.err:
			return Strings.errorsAuthServerUnreachable();
		case AuthErrors.SESSION_EXPIRED.err:
			return Strings.errorsAuthSessionExpired();
		case JellyfinAuthErrors.NOT_A_JELLYFIN_SERVER.err:
			return Strings.errorsAuthNotJellyfin();
		case JellyfinAuthErrors.QUICK_CONNECT_NOT_AVAILABLE.err:
			return Strings.errorsAuthQuickConnectNotAvailable();
		case JellyfinAuthErrors.QUICK_CONNECT_TIMED_OUT.err:
			return Strings.errorsAuthQuickConnectTimedOut();
	}

	return Strings.errorsAuthConnection();
}
