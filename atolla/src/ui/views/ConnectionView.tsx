import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, type LanguageCode } from '../../stores/Preferences';
import { theme } from '../../theme';
import { Button, ButtonType } from '../components/Button';
import { HttpWarningModal } from '../components/HttpWarningModal';
import { LanguageSelectModal } from '../components/LanguageSelectModal';
import { LoopingArrowSpinner } from '../components/LoopingArrowSpinner';
import type { ToastService } from '../components/ToastService';
import { closeSlot, openSlot } from '../flows/modalSlotFlow';
import { hapticFeedback } from '../haptics';

export interface ConnectionViewModel {
	animationsEnabled?: boolean;
	errorMessage: string | null;
	isConnecting: boolean;
	modalSlot?: DetachedSlot;
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

	private handleServerUrlChange = (value: unknown): void => {
		this.setState({ serverUrlInput: normalizeInputValue(value) });
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

	private copyQuickConnectCode(code: string): () => void {
		return () => {
			hapticFeedback();
			Device.copyToClipBoard(code);
			this.viewModel.toastService.show(Strings.copiedToClipboard());
		};
	}

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
						onTap={this.copyQuickConnectCode(this.viewModel.quickConnectCode)}
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
						<LoopingArrowSpinner
							accessibilityId='waiting for quick connect'
							durationSeconds={0.9}
							size={45}
							tint={theme.colors.active}
						/>
					)}
				</view>
			</view>
			{this.viewModel.errorMessage && (
				<label style={styles.errorMessage} value={this.viewModel.errorMessage} />
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
		marginTop: 10,
		textAlign: 'center',
	}),
	input: new Style({
		...theme.text.main,
		marginLeft: 10,
		width: '100%',
	}),
	inputContainer: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.pill,
		marginTop: 16,
		padding: theme.padding.pill,
		width: '100%',
	}),
	languageButton: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.radius.pill,
		bottom: 32,
		height: 48,
		justifyContent: 'center',
		position: 'absolute',
		right: 24,
		width: 48,
	}),
	languageFlag: new Style<Label>({
		font: systemFont(16),
		textAlign: 'center',
	}),
	logoContainer: new Style({
		alignItems: 'center' as const,
		backgroundColor: theme.colors.bg,
		height: 96,
		justifyContent: 'center' as const,
		marginBottom: 30,
		width: 96,
	}),
	logoImage: new Style({
		height: 96,
		width: 96,
	}),
	quickConnectCode: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.active,
		textAlign: 'center',
	}),
	quickConnectCodeSlot: new Style({
		alignItems: 'center' as const,
		height: 28,
		justifyContent: 'center' as const,
	}),
	quickConnectContainer: new Style({
		alignItems: 'center' as const,
		marginTop: 10,
	}),
	quickConnectSpinnerSlot: new Style({
		alignItems: 'center' as const,
		height: 46,
		justifyContent: 'center' as const,
		marginTop: 10,
	}),
	root: new Style({
		alignItems: 'center' as const,
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'center' as const,
		padding: 20,
		position: 'relative' as const,
		width: '100%',
	}),
	subtitle: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	title: new Style<Label>({
		...theme.text.display,
		marginBottom: 6,
		textAlign: 'center',
	}),
};
