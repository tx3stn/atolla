import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';
import { Checkbox } from './Checkbox';
import { ModalActionButton } from './ModalActionButton';
import { ModalBase, modalStyles } from './ModalBase';
import { extractErrorMessage, normalizeInputValue } from './modalInput';

export interface QueueTrackSelectionOptions {
	includePlayed: boolean;
	includeUpNext: boolean;
}

export interface CreatePlaylistFromQueueModalViewModel {
	animationsEnabled?: boolean;
	onCancel: () => void;
	onCreate: (name: string, options: QueueTrackSelectionOptions) => Promise<void>;
}

interface CreatePlaylistFromQueueModalState {
	errorMessage: string | null;
	includePlayed: boolean;
	includeUpNext: boolean;
	isCreating: boolean;
	playlistName: string;
}

export class CreatePlaylistFromQueueModal extends StatefulComponent<
	CreatePlaylistFromQueueModalViewModel,
	CreatePlaylistFromQueueModalState
> {
	state: CreatePlaylistFromQueueModalState = {
		errorMessage: null,
		includePlayed: true,
		includeUpNext: true,
		isCreating: false,
		playlistName: '',
	};

	private toggleIncludePlayed = (): void => {
		this.setState({ includePlayed: !this.state.includePlayed });
	};

	private toggleIncludeUpNext = (): void => {
		this.setState({ includeUpNext: !this.state.includeUpNext });
	};

	handleCreate = (): void => {
		const { onCancel, onCreate } = this.viewModel;
		const name = this.state.playlistName.trim();
		if (!name || this.state.isCreating) return;
		this.setState({ errorMessage: null, isCreating: true });
		onCreate(name, {
			includePlayed: this.state.includePlayed,
			includeUpNext: this.state.includeUpNext,
		})
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
		const { errorMessage, includePlayed, includeUpNext, isCreating, playlistName } = this.state;
		const canCreate = playlistName.trim().length > 0 && !isCreating;

		<ModalBase accessibilityId='create-playlist-from-queue-modal' onDismiss={onCancel}>
			<label
				numberOfLines={0}
				style={modalStyles.title}
				value={Strings.createPlaylistFromQueueModalTitle()}
			/>
			<view style={modalStyles.divider} />
			<view style={styles.inputContainer}>
				<textfield
					accessibilityId='create-playlist-from-queue-name-input'
					accessibilityLabel='create-playlist-from-queue-name-input'
					autocapitalization='sentences'
					onChange={this.handleNameChange}
					placeholder={Strings.playlistNamePlaceholder()}
					style={styles.input}
					value={playlistName}
				/>
			</view>
			<Checkbox
				accessibilityId='create-playlist-from-queue-include-played'
				checked={includePlayed}
				label={Strings.createPlaylistIncludePlayed()}
				onToggle={this.toggleIncludePlayed}
			/>
			<Checkbox
				accessibilityId='create-playlist-from-queue-include-up-next'
				checked={includeUpNext}
				label={Strings.createPlaylistIncludeUpNext()}
				onToggle={this.toggleIncludeUpNext}
			/>
			{errorMessage && <label style={styles.errorLabel} value={errorMessage} />}
			<view style={styles.confirmDivider} />
			<view style={modalStyles.actions}>
				<ModalActionButton
					accessibilityId='create-playlist-from-queue-create-button'
					animationsEnabled={this.viewModel.animationsEnabled}
					label={Strings.create()}
					labelStyle={canCreate ? styles.actionLabelActive : styles.actionLabelDisabled}
					onPress={this.handleCreate}
				/>
				<view style={modalStyles.actionSeparator} />
				<ModalActionButton
					accessibilityId='create-playlist-from-queue-cancel-button'
					animationsEnabled={this.viewModel.animationsEnabled}
					label={Strings.cancel()}
					onPress={onCancel}
				/>
			</view>
		</ModalBase>;
	}
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
