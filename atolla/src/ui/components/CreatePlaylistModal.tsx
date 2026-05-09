import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';

export interface CreatePlaylistModalViewModel {
	isCreating: boolean;
	onCancel: () => void;
	onCreate: (name: string) => void;
}

interface CreatePlaylistModalState {
	playlistName: string;
}

export class CreatePlaylistModal extends StatefulComponent<
	CreatePlaylistModalViewModel,
	CreatePlaylistModalState
> {
	state: CreatePlaylistModalState = {
		playlistName: '',
	};

	onRender(): void {
		const { isCreating, onCancel, onCreate } = this.viewModel;
		const { playlistName } = this.state;
		const canCreate = playlistName.trim().length > 0 && !isCreating;

		<blur blurStyle={theme.modalBlurStyle} onTap={onCancel} style={styles.backdrop}>
			<view onTap={() => {}} style={styles.card}>
				<label style={styles.title} value={Strings.createPlaylistModalTitle()} />
				<view style={styles.divider} />
				<view style={styles.inputContainer}>
					<textfield
						accessibilityLabel='create-playlist-name-input'
						autocapitalization='sentences'
						onChange={(value: unknown) => {
							this.setState({ playlistName: normalizeInputValue(value) });
						}}
						placeholder={Strings.playlistNamePlaceholder()}
						style={styles.input}
						value={playlistName}
					/>
				</view>
				<view style={styles.confirmDivider} />
				<view style={styles.actions}>
					<view
						accessibilityLabel='create-playlist-create-button'
						onTap={() => {
							if (canCreate) onCreate(playlistName.trim());
						}}
						style={styles.actionButton}
					>
						<label
							style={canCreate ? styles.actionLabelActive : styles.actionLabelDisabled}
							value={Strings.create()}
						/>
					</view>
					<view style={styles.actionSeparator} />
					<view
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
