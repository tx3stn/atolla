// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';

export interface SettingsViewModel {
	preferences: Preferences;
}

export class SettingsView extends Component<SettingsViewModel> {
	onRender(): void {
		<view style={styles.root}>
			<label style={styles.sectionTitle} value='CACHE' />
			<view style={styles.section}>
				<view accessibilityLabel='settings-cache-clear-btn' contentDescription='settings-cache-clear-btn' onTap={createReusableCallback(() => {})} style={styles.button}>
					<label style={styles.buttonLabel} value='Clear Cache' />
				</view>
			</view>
		</view>;
	}
}

const styles = {
	button: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		padding: 14,
	}),
	buttonLabel: new Style({
		...theme.text.main,
		color: theme.colors.active,
	}),
	root: new Style({
		padding: 20,
		width: '100%',
	}),
	section: new Style({
		marginTop: 8,
	}),
	sectionTitle: new Style({
		...theme.text.sub,
		letterSpacing: 1,
		marginBottom: 4,
		marginLeft: 4,
	}),
};
