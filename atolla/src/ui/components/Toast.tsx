// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { theme } from '../../theme';

export interface ToastViewModel {
	message: string;
}

export class Toast extends Component<ToastViewModel> {
	onRender(): void {
		<view accessibilityLabel='toast' contentDescription='toast' style={styles.container}>
			<label numberOfLines={2} style={styles.message} value={this.viewModel.message} />
		</view>;
	}
}

const styles = {
	container: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.toastGlassBg,
		borderRadius: 999,
		bottom: 40,
		left: '20%',
		marginBottom: 14,
		padding: 12,
		position: 'absolute',
		right: '20%',
		shadowColor: theme.colors.bg,
		shadowOffset: { height: 6, width: 0 },
		shadowOpacity: 0.2,
		shadowRadius: 12,
		zIndex: 200,
	}),
	message: new Style({
		...theme.text.main,
	}),
};
