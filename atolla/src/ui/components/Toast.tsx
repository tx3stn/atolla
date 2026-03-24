// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { theme } from '../../theme';

export interface ToastViewModel {
	message: string;
}

export class Toast extends Component<ToastViewModel> {
	onRender(): void {
		<view style={styles.container} testID='toast'>
			<label numberOfLines={1} style={styles.message} value={this.viewModel.message} />
		</view>;
	}
}

const styles = {
	container: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		bottom: 40,
		left: 20,
		paddingBottom: 12,
		paddingLeft: 20,
		paddingRight: 20,
		paddingTop: 12,
		position: 'absolute',
		right: 20,
		zIndex: 200,
	}),
	message: new Style({
		...theme.text.main,
	}),
};
