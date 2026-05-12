import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';

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

	onRender(): void {
		const { onCancel } = this.viewModel;
		const { errorMessage, isCreating, playlistName } = this.state;
		const canCreate = playlistName.trim().length > 0 && !isCreating;

		<blur blurStyle={theme.modalBlurStyle} onTap={onCancel} style={styles.backdrop}>
			<view onTap={() => {}} style={styles.card}>
				<label style={styles.title} value={Strings.createPlaylistModalTitle()} />
				<view style={styles.divider} />
				<view style={styles.inputContainer}>
					<textfield
						accessibilityId='create-playlist-name-input'
						accessibilityLabel='create-playlist-name-input'
						autocapitalization='sentences'
						onChange={(value: unknown) => {
							this.setState({ errorMessage: null, playlistName: normalizeInputValue(value) });
						}}
						placeholder={Strings.playlistNamePlaceholder()}
						style={styles.input}
						value={playlistName}
					/>
				</view>
				{errorMessage && <label style={styles.errorLabel} value={errorMessage} />}
				<view style={styles.confirmDivider} />
				<view style={styles.actions}>
					<view
						accessibilityId='create-playlist-create-button'
						accessibilityLabel='create-playlist-create-button'
						onTap={this.handleCreate}
						style={styles.actionButton}
					>
						<label
							style={canCreate ? styles.actionLabelActive : styles.actionLabelDisabled}
							value={Strings.create()}
						/>
					</view>
					<view style={styles.actionSeparator} />
					<view
						accessibilityId='create-playlist-cancel-button'
						accessibilityLabel='create-playlist-cancel-button'
						onTap={onCancel}
						style={styles.actionButton}
					>
						<label style={styles.actionLabel} value={Strings.cancel()} />
					</view>
				</view>
			</view>
		</blur>;
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
	actionButton: new Style<Layout>({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	actionLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
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
	actionSeparator: new Style({
		backgroundColor: theme.colors.separator,
		width: 1,
	}),
	actions: new Style<Layout>({
		flexDirection: 'row',
	}),
	backdrop: new Style({
		alignItems: 'center' as const,
		backgroundColor: theme.modalBackdropColor,
		bottom: 0,
		height: '100%',
		justifyContent: 'center' as const,
		left: 0,
		position: 'absolute' as const,
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 100,
	}),
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		padding: 20,
		slowClipping: true,
		width: '90%',
	}),
	confirmDivider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 14,
		width: '100%',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 12,
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
		borderRadius: theme.borderRadius,
		paddingBottom: 12,
		paddingLeft: 12,
		paddingRight: 12,
		paddingTop: 12,
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
