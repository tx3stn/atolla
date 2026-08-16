import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface SelectOptionViewModel<Value extends string | number = number> {
	accessibilityId: string;
	formatValue?: (value: Value) => string;
	label: string;
	onSelect: (value: Value) => void;
	options: ReadonlyArray<Value>;
	selectedValue: Value;
}

interface SelectOptionState {
	isOpen: boolean;
}

export class SelectOption<Value extends string | number = number> extends StatefulComponent<
	SelectOptionViewModel<Value>,
	SelectOptionState
> {
	state: SelectOptionState = { isOpen: false };

	private optionTapHandlers = new Map<Value, () => void>();

	private handleToggle = (): void => {
		this.setState({ isOpen: !this.state.isOpen });
	};

	private getOptionTapHandler = (option: Value): (() => void) => {
		const existing = this.optionTapHandlers.get(option);
		if (existing) return existing;
		const handler = (): void => {
			this.viewModel.onSelect(option);
			this.setState({ isOpen: false });
		};
		this.optionTapHandlers.set(option, handler);
		return handler;
	};

	onRender(): void {
		const { accessibilityId, formatValue, label, options, selectedValue } = this.viewModel;
		const format = formatValue ?? ((v: Value) => `${v}`);

		<view style={styles.container}>
			<label style={styles.label} value={label} />
			<view
				accessibilityId={`${accessibilityId}-dropdown`}
				accessibilityLabel={`${accessibilityId}-dropdown`}
				onTap={this.handleToggle}
				style={styles.button}
			>
				<label style={styles.buttonLabel} value={format(selectedValue)} />
			</view>
		</view>;
		this.state.isOpen && (
			<view style={styles.optionsList}>
				{options.map((option) => (
					<view
						accessibilityId={`${accessibilityId}-option-${option}`}
						onTap={this.getOptionTapHandler(option)}
						style={option === selectedValue ? styles.optionSelected : styles.option}
					>
						<label
							style={option === selectedValue ? styles.optionLabelSelected : styles.optionLabel}
							value={format(option)}
						/>
					</view>
				))}
			</view>
		);
	}
}

const styles = {
	button: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.pill,
		minWidth: theme.scale(84),
		paddingBottom: theme.scale(12),
		paddingLeft: theme.scale(18),
		paddingRight: theme.scale(18),
		paddingTop: theme.scale(12),
	}),
	buttonLabel: new Style<Label>({
		...theme.text.main,
	}),
	container: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		marginTop: theme.scale(10),
	}),
	label: new Style<Label>({
		...theme.text.sub,
		flexGrow: 1,
		marginLeft: theme.scale(4),
	}),
	option: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.pill,
		flexGrow: 1,
		marginRight: theme.scale(8),
		paddingBottom: theme.scale(8),
		paddingTop: theme.scale(8),
	}),
	optionLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.white,
	}),
	optionLabelSelected: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.bg,
	}),
	optionSelected: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: theme.radius.pill,
		flexGrow: 1,
		marginRight: theme.scale(8),
		paddingBottom: theme.scale(8),
		paddingTop: theme.scale(8),
	}),
	optionsList: new Style<Layout>({
		flexDirection: 'row',
		marginTop: theme.scale(10),
		width: '100%',
	}),
};
