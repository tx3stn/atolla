import Strings from 'atolla_app/src/Strings';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { ProbedPlayer } from '../../models/Player';
import type { PlayerErrorCode } from '../../services/PlayerErrors';
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
	onProbe: (address: string) => Promise<ProbedPlayer>;
}

interface AddPlayerModalState {
	address: string;
	busy: boolean;
	code: string;
	error: PlayerErrorCode | null;
	player: ProbedPlayer | null;
}

export class AddPlayerModal extends StatefulComponent<
	AddPlayerModalViewModel,
	AddPlayerModalState
> {
	state: AddPlayerModalState = {
		address: '',
		busy: false,
		code: '',
		error: null,
		player: null,
	};

	handleAddressChange = (value: unknown): void => {
		this.setState({ address: normalizeInputValue(value), error: null });
	};

	handleCodeChange = (value: unknown): void => {
		this.setState({ code: normalizeInputValue(value), error: null });
	};

	handleConnect = (): void => {
		const { busy, code } = this.state;
		if (!CODE_PATTERN.test(code) || busy) {
			return;
		}

		this.setState({ busy: true, error: null });
		this.viewModel.onAdd(code).then(
			() => {
				this.viewModel.onCancel();
			},
			(error: unknown) => {
				this.setState({ busy: false, error: errorCodeOf(error) });
			},
		);
	};

	handleContinue = (): void => {
		const { address, busy } = this.state;
		if (address.trim() === '' || busy) {
			return;
		}

		this.setState({ busy: true, error: null });
		this.viewModel.onProbe(address).then(
			(player) => {
				this.setState({ busy: false, player });
			},
			(error: unknown) => {
				this.setState({ busy: false, error: errorCodeOf(error) });
			},
		);
	};

	onRender(): void {
		const { animationsEnabled, onCancel } = this.viewModel;
		const { address, busy, code, error, player } = this.state;

		<ModalBase accessibilityId='add-player-modal' onDismiss={onCancel}>
			<label
				numberOfLines={0}
				style={modalStyles.title}
				value={
					player === null ? Strings.playersAddTitle() : Strings.playersAddPairWith(player.name)
				}
			/>
			<view style={modalStyles.divider} />
			<view style={styles.inputContainer}>
				{player === null ? (
					<textfield
						accessibilityId='add-player-address-input'
						accessibilityLabel='add-player-address-input'
						autocapitalization='none'
						contentType='url'
						font={theme.text.main.font}
						onChange={this.handleAddressChange}
						placeholder={Strings.playersAddAddressPlaceholder()}
						style={styles.input}
						value={address}
					/>
				) : (
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
				)}
			</view>
			<view style={styles.statusSlot}>
				{busy && <LoadingSpinner accessibilityId='add-player-pairing' size={30} />}
				{error !== null && <label style={styles.errorLabel} value={errorMessage(error)} />}
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
					{player === null ? (
						<Button
							accessibilityId='add-player-continue'
							animationsEnabled={animationsEnabled}
							enabled={address.trim() !== '' && !busy}
							label={Strings.playersAddContinue()}
							onTap={this.handleContinue}
							style={ButtonType.Confirm}
						/>
					) : (
						<Button
							accessibilityId='add-player-connect'
							animationsEnabled={animationsEnabled}
							enabled={CODE_PATTERN.test(code) && !busy}
							label={Strings.connectButton()}
							onTap={this.handleConnect}
							style={ButtonType.Confirm}
						/>
					)}
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

function errorCodeOf(error: unknown): PlayerErrorCode | null {
	return isErrorConst(error) ? (error.err as PlayerErrorCode) : null;
}

function errorMessage(code: PlayerErrorCode | null): string {
	switch (code) {
		case 'invalid_address':
			return Strings.playersAddInvalidAddress();
		case 'not_an_atolla_player':
			return Strings.playersAddNotAPlayer();
		case 'player_timed_out':
		case 'player_unreachable':
			return Strings.playersAddUnreachable();
		default:
			return Strings.playersAddFailed();
	}
}
