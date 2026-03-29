// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
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
	logoContainer: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		borderRadius: 30,
		height: 200,
		justifyContent: 'center',
		marginBottom: 16,
		width: 200,
	}),
	logoImage: new Style({
		height: 200,
		width: 200,
	}),
	root: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
};
