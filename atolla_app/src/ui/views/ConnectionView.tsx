import res from 'atolla_app/res';
import Strings from 'atolla_core/src/Strings';
import type { AuthError } from 'atolla_jellyfin/src/services/AuthErrors';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ImageView, Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, type LanguageCode } from '../../stores/Preferences';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import { LoadingSpinner } from '../animations/LoadingSpinner';
import { Button, ButtonType } from '../components/Button';
import { HttpWarningModal } from '../components/HttpWarningModal';
import { LanguageSelectModal } from '../components/LanguageSelectModal';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';

export interface ConnectionViewModel {
	animationsEnabled?: boolean;
	errorMessage: AuthError | null;
	isConnecting: boolean;
	modalSlot?: DetachedSlot;
	onCancelConnect: () => void;
	onConnect: (serverUrl: string) => void;
	onLanguageChange?: (code: LanguageCode) => void;
	quickConnectCode: string | null;
	selectedLanguage?: LanguageCode;
	serverUrl: string;
	toastService: ToastService;
}

interface ConnectionState {
	serverUrlInput: string;
}

export class ConnectionView extends StatefulComponent<ConnectionViewModel, ConnectionState> {
	private pendingConnectInput: string | null = null;

	state: ConnectionState = {
		serverUrlInput: this.viewModel.serverUrl,
	};

	private handleLanguagePress = () => {
		const selectedLanguage = this.viewModel.selectedLanguage ?? DEFAULT_LANGUAGE;
		openSlot(this.viewModel.modalSlot, () => {
			<LanguageSelectModal
				onCancel={this.handleLanguageCancel}
				onSelect={this.handleLanguageSelect}
				selectedLanguage={selectedLanguage}
			/>;
		});
	};

	private handleLanguageSelect = (code: LanguageCode) => {
		this.viewModel.onLanguageChange?.(code);
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLanguageCancel = () => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleHttpWarningCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleHttpWarningConfirm = (): void => {
		closeSlot(this.viewModel.modalSlot);
		if (!this.pendingConnectInput) {
			return;
		}

		this.viewModel.onConnect(this.pendingConnectInput);
	};

	private renderHttpWarningModal = (): void => {
		<HttpWarningModal
			animationsEnabled={this.viewModel.animationsEnabled}
			onCancel={this.handleHttpWarningCancel}
			onConfirm={this.handleHttpWarningConfirm}
		/>;
	};

	// editing the url abandons the attempt it no longer describes, so the spinner stops and any
	// stale error clears instead of sitting under the field the user is already fixing. the local
	// input is committed first because cancelling re-renders this view through the parent, which
	// would otherwise redraw the textfield with the pre-keystroke value.
	private handleServerUrlChange = (value: unknown): void => {
		const next = normalizeInputValue(value);
		const changed = next !== this.state.serverUrlInput;
		this.setState({ serverUrlInput: next });

		if (changed && (this.viewModel.isConnecting || this.viewModel.errorMessage != null)) {
			this.viewModel.onCancelConnect();
		}
	};

	onViewModelUpdate(prevViewModel?: ConnectionViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const nextServerUrl = normalizeInputValue(this.viewModel.serverUrl).trim();
		const prevServerUrl = normalizeInputValue(prevViewModel.serverUrl).trim();
		const currentInput = normalizeInputValue(this.state.serverUrlInput).trim();

		if (nextServerUrl === prevServerUrl) {
			return;
		}

		if (nextServerUrl.length === 0 && currentInput.length > 0) {
			return;
		}

		if (currentInput.length > 0 && currentInput !== prevServerUrl) {
			return;
		}

		if (this.viewModel.serverUrl !== this.state.serverUrlInput) {
			this.setState({
				serverUrlInput: this.viewModel.serverUrl,
			});
		}
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

	private onConnectTap = (): void => {
		const input = normalizeInputValue(this.state.serverUrlInput).trim();
		if (!input || (this.viewModel.isConnecting && !this.viewModel.errorMessage)) {
			return;
		}

		if (/^http:\/\//i.test(input)) {
			this.pendingConnectInput = input;
			this.viewModel.modalSlot?.slotted(this.renderHttpWarningModal);
			return;
		}

		this.viewModel.onConnect(input);
	};

	onRender(): void {
		const canConnect =
			normalizeInputValue(this.state.serverUrlInput).trim().length > 0 &&
			(this.viewModel.isConnecting === false || Boolean(this.viewModel.errorMessage));
		const selectedLanguage = this.viewModel.selectedLanguage ?? DEFAULT_LANGUAGE;
		const currentFlag = LANGUAGE_OPTIONS.find((o) => o.code === selectedLanguage)?.flag ?? '🌐';

		<view style={styles.root}>
			<view style={styles.logoContainer}>
				<image src={res.logo} style={styles.logoImage} />
			</view>

			<label style={styles.title} value={Strings.connectToJellyfin()} />
			<label style={styles.subtitle} value={Strings.enterServerUrl()} />

			<view style={styles.inputContainer}>
				<textfield
					accessibilityId='connection-server-url-input'
					accessibilityLabel='connection-server-url-input'
					autocapitalization='none'
					font={theme.text.main.font}
					keyboardAppearance='dark'
					onChange={this.handleServerUrlChange}
					placeholder={Strings.serverUrlPlaceholder()}
					style={styles.input}
					value={this.state.serverUrlInput}
				/>
			</view>

			<Button
				accessibilityId='connection-connect'
				enabled={canConnect}
				label={Strings.connectButton()}
				onTap={createReusableCallback(this.onConnectTap)}
				style={ButtonType.Confirm}
			/>

			<view style={styles.quickConnectContainer}>
				{this.viewModel.quickConnectCode && (
					<view
						accessibilityId='connection-quick-connect-code'
						onTap={this.copyQuickConnectCode}
						style={styles.quickConnectCodeSlot}
					>
						<label
							style={styles.quickConnectCode}
							value={Strings.quickConnectCode(this.viewModel.quickConnectCode)}
						/>
					</view>
				)}
				<view style={styles.quickConnectSpinnerSlot}>
					{this.viewModel.isConnecting && (
						<LoadingSpinner accessibilityId='waiting for quick connect' size={45} />
					)}
				</view>
			</view>
			{this.viewModel.errorMessage && (
				<label style={styles.errorMessage} value={this.viewModel.errorMessage.msg()} />
			)}

			<view
				accessibilityId='connection-language-button'
				accessibilityLabel='connection-language-button'
				onTap={this.handleLanguagePress}
				style={styles.languageButton}
			>
				<label style={styles.languageFlag} value={currentFlag} />
			</view>
		</view>;
	}
}

const styles = {
	errorMessage: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.destructive,
		marginTop: theme.scale(10),
		textAlign: 'center',
	}),
	input: new Style<TextField>({
		...theme.text.main,
		marginLeft: theme.scale(10),
		width: '100%',
	}),
	inputContainer: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.pill,
		marginTop: theme.scale(16),
		padding: theme.padding.pill,
		width: '100%',
	}),
	languageButton: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.radius.pill,
		bottom: 32,
		height: theme.scale(48),
		justifyContent: 'center',
		position: 'absolute',
		right: 24,
		width: theme.scale(48),
	}),
	languageFlag: new Style<Label>({
		font: systemFont(theme.scale(16)),
		textAlign: 'center',
	}),
	logoContainer: new Style<View>({
		alignItems: 'center' as const,
		backgroundColor: theme.colors.bg,
		height: theme.scale(96),
		justifyContent: 'center' as const,
		marginBottom: theme.scale(30),
		width: theme.scale(96),
	}),
	logoImage: new Style<ImageView>({
		height: theme.scale(96),
		width: theme.scale(96),
	}),
	quickConnectCode: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.active,
		textAlign: 'center',
	}),
	quickConnectCodeSlot: new Style<View>({
		alignItems: 'center' as const,
		height: theme.scale(28),
		justifyContent: 'center' as const,
	}),
	quickConnectContainer: new Style<View>({
		alignItems: 'center' as const,
		marginTop: theme.scale(10),
	}),
	quickConnectSpinnerSlot: new Style<View>({
		alignItems: 'center' as const,
		height: theme.scale(46),
		justifyContent: 'center' as const,
		marginTop: theme.scale(10),
	}),
	root: new Style<View>({
		alignItems: 'center' as const,
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'center' as const,
		padding: theme.scale(20),
		position: 'relative' as const,
		width: '100%',
	}),
	subtitle: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	title: new Style<Label>({
		...theme.text.display,
		marginBottom: theme.scale(6),
		textAlign: 'center',
	}),
};

function normalizeInputValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number') {
		return String(value);
	}

	if (value && typeof value === 'object') {
		const candidate = value as {
			nativeEvent?: { text?: unknown; value?: unknown };
			query?: unknown;
			text?: unknown;
			value?: unknown;
		};

		const direct = candidate.text ?? candidate.value ?? candidate.query;
		if (typeof direct === 'string') {
			return direct;
		}

		const native = candidate.nativeEvent?.text ?? candidate.nativeEvent?.value;
		if (typeof native === 'string') {
			return native;
		}
	}

	return '';
}
