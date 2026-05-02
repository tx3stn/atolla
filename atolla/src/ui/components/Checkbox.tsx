import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface CheckboxViewModel {
	accessibilityLabel: string;
	checked: boolean;
	label: string;
	onToggle: () => void;
}

export class Checkbox extends Component<CheckboxViewModel> {
	onRender(): void {
		const { accessibilityLabel, checked, label, onToggle } = this.viewModel;

		<view accessibilityLabel={accessibilityLabel} onTap={onToggle} style={styles.row}>
			<view style={checked ? styles.checkboxChecked : styles.checkboxUnchecked}>
				{checked && <label style={styles.checkmark} value='✓' />}
			</view>
			<label style={styles.rowLabel} value={label} />
		</view>;
	}
}

const CHECKBOX_SIZE = 20;

const styles = {
	checkboxChecked: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: 4,
		height: CHECKBOX_SIZE,
		justifyContent: 'center',
		marginRight: 12,
		width: CHECKBOX_SIZE,
	}),
	checkboxUnchecked: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderColor: theme.colors.separator,
		borderRadius: 4,
		borderWidth: 1,
		height: CHECKBOX_SIZE,
		marginRight: 12,
		width: CHECKBOX_SIZE,
	}),
	checkmark: new Style<Label>({
		color: theme.colors.active,
		font: theme.text.sub.font,
		textAlign: 'center',
	}),
	row: new Style<View>({
		alignItems: 'center',
		flexDirection: 'row',
		paddingBottom: 10,
		paddingTop: 10,
	}),
	rowLabel: new Style<Label>({
		...theme.text.main,
	}),
};
