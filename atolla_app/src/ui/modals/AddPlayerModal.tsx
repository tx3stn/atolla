import Strings from 'atolla_app/src/Strings';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { LoadingSpinner } from '../animations/LoadingSpinner';
import { Button, ButtonType } from '../components/Button';
import { ModalBase, modalStyles } from './ModalBase';
import { normalizeInputValue } from './modalInput';

const CODE_LENGTH = 8;
const CODE_PATTERN = /^\d{8}$/;

export interface AddPlayerModalViewModel {
	animationsEnabled?: boolean;
	onAdd: (code: string) => Promise<unknown>;
	onCancel: () => void;
}

interface AddPlayerModalState {
	code: string;
	failed: boolean;
	isPairing: boolean;
}

export class AddPlayerModal extends StatefulComponent<
	AddPlayerModalViewModel,
	AddPlayerModalState
> {
	state: AddPlayerModalState = {
		code: '',
		failed: false,
		isPairing: false,
	};

	handleCodeChange = (value: unknown): void => {
		this.setState({ code: normalizeInputValue(value), failed: false });
	};

	handleConnect = (): void => {
		const { code, isPairing } = this.state;
		if (!CODE_PATTERN.test(code) || isPairing) {
			return;
		}

		this.setState({ failed: false, isPairing: true });
		this.viewModel.onAdd(code).then(
			() => {
				this.viewModel.onCancel();
			},
			() => {
				this.setState({ failed: true, isPairing: false });
			},
		);
	};

	onRender(): void {
		const { animationsEnabled, onCancel } = this.viewModel;
		const { code, failed, isPairing } = this.state;

		<ModalBase accessibilityId='add-player-modal' onDismiss={onCancel}>
			<label numberOfLines={0} style={modalStyles.title} value={Strings.playersAddTitle()} />
			<view style={modalStyles.divider} />
			<view style={styles.inputContainer}>
				<textfield
					accessibilityId='add-player-code-input'
					accessibilityLabel='add-player-code-input'
					autocapitalization='none'
					characterLimit={CODE_LENGTH}
					contentType='number'
					font={theme.text.main.font}
					onChange={this.handleCodeChange}
					placeholder={Strings.playersAddCodePlaceholder()}
					style={styles.input}
					value={code}
				/>
			</view>
			<view style={styles.statusSlot}>
				{isPairing && <LoadingSpinner accessibilityId='add-player-pairing' size={30} />}
				{failed && <label style={styles.errorLabel} value={Strings.playersAddFailed()} />}
			</view>
			<layout style={modalStyles.actions}>
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='add-player-cancel'
						animationsEnabled={animationsEnabled}
						label={Strings.cancel()}
						onTap={onCancel}
						style={ButtonType.Secondary}
					/>
				</layout>
				<layout style={modalStyles.actionSeparator} />
				<layout style={modalStyles.actionButton}>
					<Button
						accessibilityId='add-player-connect'
						animationsEnabled={animationsEnabled}
						enabled={CODE_PATTERN.test(code) && !isPairing}
						label={Strings.connectButton()}
						onTap={this.handleConnect}
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
	input: new Style<TextField>({
		...theme.text.main,
		width: '100%',
	}),
	inputContainer: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.default,
		padding: theme.scale(12),
	}),
	statusSlot: new Style<View>({
		alignItems: 'center',
		height: theme.scale(38),
		justifyContent: 'center',
		width: '100%',
	}),
};
