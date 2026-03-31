// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import { theme } from '../../theme';
import { Spinner } from '../components/Spinner';

export interface ConnectionViewModel {
	errorMessage: string | null;
	isConnecting: boolean;
	onConnect: (serverUrl: string) => void;
	quickConnectCode: string | null;
	serverUrl: string;
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
			text?: unknown;
			value?: unknown;
		};

		const direct = candidate.text ?? candidate.value;
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
	state: ConnectionState = {
		serverUrlInput: this.viewModel.serverUrl,
	};

	onViewModelUpdate(prevViewModel?: ConnectionViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (this.viewModel.serverUrl !== prevViewModel.serverUrl) {
			this.setState({
				serverUrlInput: this.viewModel.serverUrl,
			});
		}
	}

	private onConnectTap = (): void => {
		const input = normalizeInputValue(this.state.serverUrlInput).trim();
		if (!input || this.viewModel.isConnecting) {
			return;
		}
		this.viewModel.onConnect(input);
	};

	onRender(): void {
		const canConnect =
			normalizeInputValue(this.state.serverUrlInput).length > 0 &&
			this.viewModel.isConnecting === false;

		<view style={styles.root}>
			<view style={styles.logoContainer}>
				<image src={res.logo} style={styles.logoImage} />
			</view>

			<label style={styles.title} value='connect to jellyfin' />
			<label style={styles.subtitle} value='enter server URL to continue' />

			<view style={styles.inputContainer}>
				<textfield
					accessibilityLabel='connection-server-url-input'
					contentDescription='connection-server-url-input'
					onChange={(value: unknown) => {
						this.setState({ serverUrlInput: normalizeInputValue(value) });
					}}
					placeholder='https://jellyfin.example.com'
					style={styles.input}
					value={this.state.serverUrlInput}
				/>
			</view>

			<view
				accessibilityLabel='connection-connect-button'
				contentDescription='connection-connect-button'
				onTap={canConnect ? createReusableCallback(this.onConnectTap) : undefined}
				style={canConnect ? styles.connectButton : styles.connectButtonDisabled}
			>
				<label style={styles.connectButtonLabel} value='Connect' />
			</view>

			{this.viewModel.isConnecting && <Spinner label='waiting for quick connect approval' />}
			{this.viewModel.quickConnectCode && (
				<label style={styles.quickConnectCode} value={`Code: ${this.viewModel.quickConnectCode}`} />
			)}
			{this.viewModel.errorMessage && (
				<label style={styles.errorMessage} value={this.viewModel.errorMessage} />
			)}
		</view>;
	}
}

const styles = {
	connectButton: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 999,
		marginTop: 12,
		padding: 14,
		width: '100%',
	}),
	connectButtonDisabled: new Style({
		alignItems: 'center',
		backgroundColor: '#0b1320',
		borderRadius: 999,
		marginTop: 12,
		opacity: 0.5,
		padding: 14,
		width: '100%',
	}),
	connectButtonLabel: new Style({
		...theme.text.mainBold,
		color: theme.colors.active,
	}),
	errorMessage: new Style({
		...theme.text.sub,
		color: '#ff6b6b',
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
		borderRadius: 999,
		marginTop: 16,
		padding: 14,
		width: '100%',
	}),
	logoContainer: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: 96,
		justifyContent: 'center',
		marginBottom: 30,
		width: 96,
	}),
	logoImage: new Style({
		height: 96,
		width: 96,
	}),
	quickConnectCode: new Style({
		...theme.text.mainBold,
		color: theme.colors.active,
		marginTop: 10,
		textAlign: 'center',
	}),
	root: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'center',
		padding: 20,
		width: '100%',
	}),
	subtitle: new Style({
		...theme.text.sub,
		textAlign: 'center',
	}),
	title: new Style({
		...theme.text.display,
		marginBottom: 6,
		textAlign: 'center',
	}),
};
