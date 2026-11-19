import Strings from 'atolla_app/src/Strings';
import { type InternalError, isErrorConst } from 'atolla_core/src/utils/Errors';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { IntegrationErrors } from '../../integrations/IntegrationErrors';
import { theme, withAlpha } from '../../theme';
import { LoadingSpinner } from '../animations/LoadingSpinner';
import { Button, ButtonType } from '../components/Button';
import { ModalBase, modalStyles } from './ModalBase';
import { normalizeInputValue } from './modalInput';

export interface IntegrationConnectModalViewModel {
	animationsEnabled?: boolean;
	name: string;
	onCancel: () => void;
	onConnect: (url: string, apiKey: string) => Promise<unknown>;
	url: string;
}

interface IntegrationConnectModalState {
	apiKey: string;
	busy: boolean;
	error: InternalError<string> | null;
	url: string;
}

export class IntegrationConnectModal extends StatefulComponent<
	IntegrationConnectModalViewModel,
	IntegrationConnectModalState
> {
	state: IntegrationConnectModalState = {
		apiKey: '',
		busy: false,
		error: null,
		url: this.viewModel.url,
	};

	handleApiKeyChange = (value: unknown): void => {
		this.setState({ apiKey: normalizeInputValue(value), error: null });
	};

	handleAuthenticate = (): void => {
		const { apiKey, busy, url } = this.state;
		if (url.trim() === '' || apiKey.trim() === '' || busy) {
			return;
		}

		this.setState({ busy: true, error: null });
		this.viewModel.onConnect(url, apiKey).then(
			() => {
				this.viewModel.onCancel();
			},
			(error: unknown) => {
				this.setState({
					busy: false,
					error: isErrorConst(error) ? error : IntegrationErrors.REQUEST_FAILED,
				});
			},
		);
	};

	handleUrlChange = (value: unknown): void => {
		this.setState({ error: null, url: normalizeInputValue(value) });
	};

	onRender(): void {
		const { animationsEnabled, name, onCancel } = this.viewModel;
		const { apiKey, busy, error, url } = this.state;

		<ModalBase accessibilityId='integration-connect-modal' onDismiss={onCancel}>
			<label
				numberOfLines={0}
				style={modalStyles.title}
				value={Strings.integrationConnectTitle(name)}
			/>
			<view style={modalStyles.divider} />
			<view style={styles.inputContainer}>
				<textfield
					accessibilityId='integration-url-input'
					accessibilityLabel='integration-url-input'
					autocapitalization='none'
					autocorrection='none'
					contentType='url'
					font={theme.text.main.font}
					onChange={this.handleUrlChange}
					placeholder={Strings.integrationUrlPlaceholder()}
					style={styles.input}
					value={url}
				/>
			</view>
			<view style={styles.inputContainer}>
				<textfield
					accessibilityId='integration-api-key-input'
					accessibilityLabel='integration-api-key-input'
					autocapitalization='none'
					autocorrection='none'
					contentType='password'
					font={theme.text.main.font}
					onChange={this.handleApiKeyChange}
					placeholder={Strings.integrationApiKeyPlaceholder()}
					style={styles.input}
					value={apiKey}
				/>
			</view>
			{/^http:\/\//i.test(url.trim()) && (
				<view style={styles.httpWarningCallout}>
					<label
						numberOfLines={0}
						style={styles.httpWarningCalloutText}
						value={Strings.integrationHttpWarning()}
					/>
				</view>
			)}
			<view style={styles.statusSlot}>
				{busy && <LoadingSpinner accessibilityId='integration-connecting' size={30} />}
				{error !== null && (
					<label numberOfLines={0} style={styles.errorLabel} value={errorMessage(error, name)} />
				)}
			</view>
			<layout style={modalStyles.actions}>
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='integration-cancel'
						animationsEnabled={animationsEnabled}
						label={Strings.cancel()}
						onTap={onCancel}
						style={ButtonType.Secondary}
					/>
				</layout>
				<layout style={modalStyles.actionSeparator} />
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='integration-authenticate'
						animationsEnabled={animationsEnabled}
						enabled={url.trim() !== '' && apiKey.trim() !== '' && !busy}
						label={Strings.integrationAuthenticate()}
						onTap={this.handleAuthenticate}
						style={ButtonType.Confirm}
					/>
				</layout>
			</layout>
		</ModalBase>;
	}
}

const styles = {
	errorLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.destructive,
		textAlign: 'center',
	}),
	httpWarningCallout: new Style<View>({
		backgroundColor: withAlpha(theme.colors.warning, 0.12),
		borderRadius: theme.radius.default,
		marginTop: theme.scale(4),
		padding: theme.scale(12),
	}),
	httpWarningCalloutText: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.warning,
	}),
	input: new Style<TextField>({
		...theme.text.main,
		width: '100%',
	}),
	inputContainer: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.default,
		marginBottom: theme.scale(8),
		padding: theme.scale(12),
	}),
	statusSlot: new Style<View>({
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: theme.scale(38),
		width: '100%',
	}),
};

function errorMessage(error: InternalError<string>, name: string): string {
	switch (error.err) {
		case IntegrationErrors.TIMED_OUT.err:
			return Strings.errorsIntegrationTimedOut(name);
		case IntegrationErrors.UNAUTHORIZED.err:
			return Strings.errorsIntegrationUnauthorized(name);
		case IntegrationErrors.UNREACHABLE.err:
			return Strings.errorsIntegrationUnreachable(name);
		case IntegrationErrors.WRONG_SERVICE.err:
			return Strings.errorsIntegrationWrongService(name);
		default:
			return Strings.errorsIntegrationRequestFailed(name);
	}
}
