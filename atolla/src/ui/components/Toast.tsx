// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { scrollPaddingBottom, theme } from '../../theme';

export interface ToastViewModel {
	message: string;
}

export class Toast extends Component<ToastViewModel> {
	onRender(): void {
		<view style={styles.container} testID='toast'>
			<label numberOfLines={2} style={styles.message} value={this.viewModel.message} />
		</view>;
	}
}

const styles = {
	container: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 999,
		borderWidth: 1,
		bottom: 40,
		left: 20,
		marginBottom: 14,
		padding: 12,
		position: 'absolute',
		right: 20,
		zIndex: 200,
	}),
	message: new Style({
		...theme.text.main,
	}),
};
