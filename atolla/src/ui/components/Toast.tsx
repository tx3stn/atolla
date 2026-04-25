import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface ToastViewModel {
	message: string;
}

export class Toast extends Component<ToastViewModel> {
	onRender(): void {
		<view accessibilityLabel='toast' style={styles.container}>
			<label numberOfLines={5} style={styles.message} value={this.viewModel.message} />
		</view>;
	}
}

const styles = {
	container: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.toastGlassBg,
		borderRadius: 999,
		bottom: 40,
		boxShadow: `0 6 12 ${theme.colors.bg}`,
		left: '20%',
		marginBottom: 14,
		padding: 12,
		position: 'absolute',
		right: '20%',
		zIndex: 200,
	}),
	message: new Style<Label>({
		...theme.text.main,
	}),
};
