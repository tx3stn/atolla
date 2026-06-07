import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { LANGUAGE_OPTIONS, type LanguageCode } from '../../stores/Preferences';
import { theme } from '../../theme';
import { hapticFeedback } from '../haptics';
import { ModalBase, modalStyles } from './ModalBase';

export interface LanguageSelectModalViewModel {
	onCancel: () => void;
	onSelect: (code: LanguageCode) => void;
	selectedLanguage: LanguageCode;
}

export class LanguageSelectModal extends Component<LanguageSelectModalViewModel> {
	private readonly selectHandlers = new Map<LanguageCode, () => void>();

	private getSelectHandler = (code: LanguageCode): (() => void) => {
		hapticFeedback();

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

		<ModalBase accessibilityId='language-select-modal' onDismiss={this.viewModel.onCancel}>
			<label style={modalStyles.title} value={Strings.settingsSectionLanguage()} />
			<view style={modalStyles.divider} />
			{LANGUAGE_OPTIONS.map((option) => (
				<view
					accessibilityId={`language-option-${option.code}`}
					onTap={this.getSelectHandler(option.code)}
					style={option.code === selectedLanguage ? styles.optionSelected : styles.option}
				>
					<label style={styles.optionLabel} value={`${option.flag}  ${option.name}`} />
				</view>
			))}
		</ModalBase>;
	}
}

const styles = {
	option: new Style<View>({
		borderRadius: theme.radius.default,
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
		borderRadius: theme.radius.default,
		marginBottom: 4,
		paddingBottom: 14,
		paddingLeft: 12,
		paddingTop: 14,
	}),
};
