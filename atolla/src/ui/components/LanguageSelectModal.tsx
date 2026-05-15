import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { LANGUAGE_OPTIONS, type LanguageCode } from '../../stores/Preferences';
import { theme } from '../../theme';

export interface LanguageSelectModalViewModel {
	onCancel: () => void;
	onSelect: (code: LanguageCode) => void;
	selectedLanguage: LanguageCode;
}

export class LanguageSelectModal extends Component<LanguageSelectModalViewModel> {
	private stopPropagation = () => {};
	private readonly selectHandlers = new Map<LanguageCode, () => void>();

	private getSelectHandler = (code: LanguageCode): (() => void) => {
		const existing = this.selectHandlers.get(code);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			this.viewModel.onSelect(code);
		};
		this.selectHandlers.set(code, handler);
		return handler;
	};

	onRender(): void {
		const { selectedLanguage } = this.viewModel;

		<blur blurStyle={theme.modalBlurStyle} onTap={this.viewModel.onCancel} style={styles.backdrop}>
			<view onTap={this.viewModel.onCancel} style={styles.centeredContainer}>
				<view
					accessibilityId='language-select-modal'
					accessibilityLabel='language-select-modal'
					onTap={this.stopPropagation}
					style={styles.card}
				>
					<label style={styles.title} value={Strings.settingsSectionLanguage()} />
					<view style={styles.divider} />
					{LANGUAGE_OPTIONS.map((option) => (
						<view
							accessibilityId={`language-option-${option.code}`}
							onTap={this.getSelectHandler(option.code)}
							style={option.code === selectedLanguage ? styles.optionSelected : styles.option}
						>
							<label style={styles.optionLabel} value={`${option.flag}  ${option.name}`} />
						</view>
					))}
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	backdrop: new Style<BlurView>({
		backgroundColor: theme.modalBackdropColor,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 100,
	}),
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		padding: 20,
		width: '90%',
	}),
	centeredContainer: new Style<Layout>({
		alignItems: 'center',
		flexGrow: 1,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
	divider: new Style<View>({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 12,
		width: '100%',
	}),
	option: new Style<View>({
		borderRadius: theme.borderRadius,
		marginBottom: 4,
		paddingBottom: 14,
		paddingLeft: 12,
		paddingTop: 14,
	}),
	optionLabel: new Style<Label>({
		...theme.text.main,
	}),
	optionSelected: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		marginBottom: 4,
		paddingBottom: 14,
		paddingLeft: 12,
		paddingTop: 14,
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
