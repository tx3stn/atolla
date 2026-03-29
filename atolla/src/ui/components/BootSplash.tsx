// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { theme } from '../../theme';

export interface BootSplashViewModel {
	message?: string;
}

export class BootSplash extends Component<BootSplashViewModel> {
	onRender(): void {
		const message = this.viewModel.message ?? 'loading your library';

		<view style={styles.root}>
			<view style={styles.logoPlaceholder}>
				<label style={styles.logoPlaceholderText} value='A' />
			</view>
			<label style={styles.title} value='atolla' />
			<label style={styles.subtitle} value={message} />
			<view style={styles.progressTrack}>
				<view style={styles.progressFill} />
			</view>
		</view>;
	}
}

const styles = {
	logoPlaceholder: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 24,
		height: 48,
		justifyContent: 'center',
		marginBottom: 16,
		width: 48,
	}),
	logoPlaceholderText: new Style({
		...theme.text.mainBold,
		color: theme.colors.active,
	}),
	progressFill: new Style({
		backgroundColor: theme.colors.active,
		height: '100%',
		width: '42%',
	}),
	progressTrack: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 99,
		height: 4,
		marginTop: 18,
		overflow: 'hidden',
		width: 124,
	}),
	root: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'center',
		width: '100%',
	}),
	subtitle: new Style({
		...theme.text.sub,
		color: theme.colors.grey,
		letterSpacing: 0.6,
		textAlign: 'center',
	}),
	title: new Style({
		...theme.text.display,
		fontSize: 30,
		letterSpacing: 1,
		marginBottom: 4,
		textAlign: 'center',
		textTransform: 'lowercase',
	}),
};
