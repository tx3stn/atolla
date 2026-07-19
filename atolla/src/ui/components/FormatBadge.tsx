import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme, withAlpha } from '../../theme';

export interface FormatBadgeViewModel {
	backgroundColor?: string;
	color?: string;
	value: string;
}

export class FormatBadge extends Component<FormatBadgeViewModel> {
	onRender() {
		const color = this.viewModel.color ?? theme.text.sub.color;
		const bg = this.viewModel.backgroundColor ?? withAlpha(color, 0.1);
		<view style={createContainerStyle(bg)}>
			<label style={createLabelStyle(color)} value={this.viewModel.value} />
		</view>;
	}
}

const containerStyleByBackgroundColor: Record<string, Style<View>> = {};
const labelStyleByColor: Record<string, Style<Label>> = {};

function createContainerStyle(backgroundColor: string): Style<View> {
	const cached = containerStyleByBackgroundColor[backgroundColor];
	if (cached) {
		return cached;
	}

	const style = new Style<View>({
		backgroundColor,
		borderRadius: theme.radius.card,
		paddingBottom: 3,
		paddingLeft: 7,
		paddingRight: 7,
		paddingTop: 3,
	});
	containerStyleByBackgroundColor[backgroundColor] = style;
	return style;
}

function createLabelStyle(color: string): Style<Label> {
	const cached = labelStyleByColor[color];
	if (cached) {
		return cached;
	}

	const style = new Style<Label>({
		...theme.text.sub,
		color,
	});
	labelStyleByColor[color] = style;
	return style;
}
