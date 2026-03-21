// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Preferences } from '../../stores/Preferences';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES } from '../../stores/Preferences';
import { theme } from '../../theme';

const GB = 1024 * 1024 * 1024;

function bytesToGb(bytes: number): string {
	return String(Math.round(bytes / GB));
}

function gbToBytes(gb: string): number | null {
	const n = Number(gb);
	return Number.isFinite(n) && n > 0 ? Math.round(n * GB) : null;
}

export interface SettingsViewModel {
	imageCacheMaxBytes?: number;
	onCacheSizeChange?: (bytes: number) => void;
	preferences: Preferences;
}

interface SettingsState {
	cacheSizeInput: string;
}

export class SettingsView extends StatefulComponent<SettingsViewModel, SettingsState> {
	state: SettingsState = {
		cacheSizeInput: bytesToGb(this.viewModel.imageCacheMaxBytes ?? DEFAULT_IMAGE_CACHE_MAX_BYTES),
	};

	onViewModelUpdate(): void {
		this.setState({
			cacheSizeInput: bytesToGb(this.viewModel.imageCacheMaxBytes ?? DEFAULT_IMAGE_CACHE_MAX_BYTES),
		});
	}

	handleCacheSizeChange = (text: string): void => {
		this.setState({ cacheSizeInput: text });
		const bytes = gbToBytes(text);
		if (bytes !== null) {
			this.viewModel.onCacheSizeChange?.(bytes);
		}
	};

	onRender(): void {
		<view style={styles.root}>
			<label style={styles.sectionTitle} value='CACHE' />
			<view style={styles.section}>
				<view style={styles.settingRow}>
					<label style={styles.settingLabel} value='Cache Size (GB)' />
					<view style={styles.inputContainer}>
						<textfield
							accessibilityLabel='settings-cache-size-input'
							contentDescription='settings-cache-size-input'
							keyboardType='numeric'
							onChange={this.handleCacheSizeChange}
							style={styles.input}
							value={this.state.cacheSizeInput}
						/>
					</view>
				</view>
				<view
					accessibilityLabel='settings-cache-clear-btn'
					contentDescription='settings-cache-clear-btn'
					onTap={createReusableCallback(() => {})}
					style={styles.button}
				>
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
		marginTop: 8,
		padding: 14,
	}),
	buttonLabel: new Style({
		...theme.text.main,
		color: theme.colors.active,
	}),
	input: new Style({
		...theme.text.main,
		flexGrow: 1,
	}),
	inputContainer: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		padding: 14,
		width: '50%',
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
	settingLabel: new Style({
		...theme.text.sub,
		marginLeft: 4,
		marginRight: 12,
	}),
	settingRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
	}),
};
