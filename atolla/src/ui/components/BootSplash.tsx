import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface BootSplashViewModel {
	message?: string;
}

export class BootSplash extends Component<BootSplashViewModel> {
	onRender(): void {
		<view style={styles.root}>
			<view style={styles.logoContainer}>
				<image src={res.logo} style={styles.logoImage} />
			</view>
		</view>;
	}
}

const styles = {
	logoContainer: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: 80,
		justifyContent: 'center',
		marginBottom: 16,
		width: 80,
	}),
	logoImage: new Style<View>({
		height: 80,
		width: 80,
	}),
	root: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
};
