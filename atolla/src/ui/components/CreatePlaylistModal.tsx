import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';
import { ModalBase, modalStyles } from './ModalBase';

export interface CreatePlaylistModalViewModel {
	onCancel: () => void;
	onCreate: (name: string) => Promise<void>;
}

interface CreatePlaylistModalState {
	errorMessage: string | null;
	isCreating: boolean;
	playlistName: string;
}

export class CreatePlaylistModal extends StatefulComponent<
	CreatePlaylistModalViewModel,
	CreatePlaylistModalState
> {
	state: CreatePlaylistModalState = {
		errorMessage: null,
		isCreating: false,
		playlistName: '',
	};

	handleCreate = (): void => {
		const { onCancel, onCreate } = this.viewModel;
		const name = this.state.playlistName.trim();
		if (!name || this.state.isCreating) return;
		this.setState({ errorMessage: null, isCreating: true });
		onCreate(name)
			.then(() => {
				onCancel();
			})
			.catch((e: unknown) => {
				this.setState({ errorMessage: extractErrorMessage(e), isCreating: false });
			});
	};

	handleNameChange = (value: unknown): void => {
		this.setState({ errorMessage: null, playlistName: normalizeInputValue(value) });
	};

	onRender(): void {
		const { onCancel } = this.viewModel;
		const { errorMessage, isCreating, playlistName } = this.state;
		const canCreate = playlistName.trim().length > 0 && !isCreating;

		<ModalBase onDismiss={onCancel}>
			<label style={modalStyles.title} value={Strings.createPlaylistModalTitle()} />
			<view style={modalStyles.divider} />
			<view style={styles.inputContainer}>
				<textfield
					accessibilityId='create-playlist-name-input'
					accessibilityLabel='create-playlist-name-input'
					autocapitalization='sentences'
					onChange={this.handleNameChange}
					placeholder={Strings.playlistNamePlaceholder()}
					style={styles.input}
					value={playlistName}
				/>
			</view>
			{errorMessage && <label style={styles.errorLabel} value={errorMessage} />}
			<view style={styles.confirmDivider} />
			<view style={modalStyles.actions}>
				<view
					accessibilityId='create-playlist-create-button'
					accessibilityLabel='create-playlist-create-button'
					onTap={this.handleCreate}
					style={modalStyles.actionButton}
				>
					<label
						style={canCreate ? styles.actionLabelActive : styles.actionLabelDisabled}
						value={Strings.create()}
					/>
				</view>
				<view style={modalStyles.actionSeparator} />
				<view
					accessibilityId='create-playlist-cancel-button'
					accessibilityLabel='create-playlist-cancel-button'
					onTap={onCancel}
					style={modalStyles.actionButton}
				>
					<label style={modalStyles.actionLabel} value={Strings.cancel()} />
				</view>
			</view>
		</ModalBase>;
	}
}

function extractErrorMessage(e: unknown): string {
	if (e != null && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
		return e.message;
	}
	return 'Unknown error';
}

function normalizeInputValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (value && typeof value === 'object') {
		const c = value as {
			nativeEvent?: { text?: unknown; value?: unknown };
			text?: unknown;
			value?: unknown;
		};
		const direct = c.text ?? c.value ?? c.nativeEvent?.text ?? c.nativeEvent?.value;
		if (typeof direct === 'string') return direct;
	}
	return '';
}

const styles = {
	actionLabelActive: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
		textAlign: 'center',
	}),
	actionLabelDisabled: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
		textAlign: 'center',
	}),
	confirmDivider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 14,
		width: '100%',
	}),
	errorLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.destructive,
		marginTop: 8,
	}),
	input: new Style<TextField>({
		...theme.text.main,
		width: '100%',
	}),
	inputContainer: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.default,
		paddingBottom: 12,
		paddingLeft: 12,
		paddingRight: 12,
		paddingTop: 12,
	}),
};
