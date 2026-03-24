// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ClearCacheSelection } from '../../services/ImageCache';
import type { Preferences } from '../../stores/Preferences';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES } from '../../stores/Preferences';
import { theme } from '../../theme';
import { CacheClearModal } from '../components/CacheClearModal';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Toast';
import { Toggle } from '../components/Toggle';

const GB = 1024 * 1024 * 1024;

function bytesToGb(bytes: number): string {
	return String(Math.round(bytes / GB));
}

function gbToBytes(gb: string): number | null {
	const n = Number(gb);
	return Number.isFinite(n) && n > 0 ? Math.round(n * GB) : null;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 MB';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < GB) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / GB).toFixed(2)} GB`;
}

export interface SettingsViewModel {
	animationsEnabled: boolean;
	imageCacheBufferedBytes?: number;
	imageCacheBufferedCount?: number;
	imageCacheError?: string | null;
	imageCacheMaxBytes?: number;
	onAnimationsChange?: (enabled: boolean) => void;
	onCacheSizeChange?: (bytes: number) => void;
	onClearCache?: (selection: ClearCacheSelection) => void;
	onGeneratePalettes?: () => void;
	paletteCount?: number;
	paletteError?: string | null;
	paletteFailureCount?: number;
	paletteFailureDetails?: Array<string>;
	paletteFailureSummary?: string | null;
	paletteProcessedCount?: number;
	paletteTotalCount?: number | null;
	preferences: Preferences;
}

interface SettingsState {
	cacheSizeInput: string;
	showCacheClearModal: boolean;
	showCacheToast: boolean;
	showPaletteFailureModal: boolean;
}

export class SettingsView extends StatefulComponent<SettingsViewModel, SettingsState> {
	state: SettingsState = {
		cacheSizeInput: bytesToGb(this.viewModel.imageCacheMaxBytes ?? DEFAULT_IMAGE_CACHE_MAX_BYTES),
		showCacheClearModal: false,
		showCacheToast: false,
		showPaletteFailureModal: false,
	};

	private toastTimer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(): void {
		if (this.toastTimer != null) {
			clearTimeout(this.toastTimer);
		}
	}

	private handleClearCachePress = () => {
		this.setState({ showCacheClearModal: true });
	};

	private handleCacheClearConfirm = (selection: ClearCacheSelection) => {
		this.viewModel.onClearCache?.(selection);
		if (this.toastTimer != null) {
			clearTimeout(this.toastTimer);
		}
		this.setState({ showCacheClearModal: false, showCacheToast: true });
		this.toastTimer = setTimeout(() => {
			this.setState({ showCacheToast: false });
		}, 2500);
	};

	private handleCacheClearCancel = () => {
		this.setState({ showCacheClearModal: false });
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
		const {
			animationsEnabled,
			imageCacheBufferedBytes,
			imageCacheBufferedCount,
			onAnimationsChange,
			onGeneratePalettes,
			paletteCount,
			paletteError,
			paletteFailureCount,
			paletteFailureDetails,
			paletteFailureSummary,
			paletteProcessedCount,
			paletteTotalCount,
		} = this.viewModel;

		const processed = paletteProcessedCount ?? (paletteCount ?? 0) + (paletteFailureCount ?? 0);
		const isDone = paletteTotalCount != null && processed >= paletteTotalCount;
		const failureSuffix = (paletteFailureCount ?? 0) > 0 ? `, ${paletteFailureCount} failed` : '';
		const hasFailureDetails = (paletteFailureDetails?.length ?? 0) > 0;

		const paletteStatusLabel = (() => {
			if (paletteTotalCount === null || paletteTotalCount === undefined)
				return 'Generate palettes from artwork';
			if (isDone) return `Processing complete — ${paletteCount} palettes ready${failureSuffix}`;
			return `Processing ${processed} / ${paletteTotalCount}${failureSuffix}`;
		})();

		<view style={styles.root}>
			<label style={styles.sectionTitle} value='APPEARANCE' />
			<view style={styles.section}>
				<view style={styles.settingRow}>
					<label style={styles.settingLabel} value='Animations' />
					<Toggle
						accessibilityLabel='settings-animations-toggle'
						enabled={animationsEnabled}
						onToggle={(enabled) => onAnimationsChange?.(enabled)}
					/>
				</view>
			</view>

			<label style={styles.sectionTitle} value='ARTWORK PALETTES' />
			<view style={styles.section}>
				<view
					accessibilityLabel='settings-generate-palettes-btn'
					contentDescription='settings-generate-palettes-btn'
					onTap={createReusableCallback(() => onGeneratePalettes?.())}
					style={styles.button}
				>
					<label style={styles.buttonLabel} value='Generate Palettes' />
				</view>
				{paletteTotalCount !== null && paletteTotalCount !== undefined && (
					<label style={styles.paletteStatus} value={paletteStatusLabel} />
				)}
				{paletteTotalCount != null && paletteError != null && (
					<label style={styles.paletteError} value={paletteError} />
				)}
				{paletteTotalCount != null && paletteFailureSummary != null && (
					<label
						accessibilityLabel='settings-palette-failure-summary'
						style={styles.paletteError}
						value={paletteFailureSummary}
					/>
				)}
				{isDone && hasFailureDetails && (
					<view
						accessibilityLabel='settings-palette-failure-details-btn'
						contentDescription='settings-palette-failure-details-btn'
						onTap={createReusableCallback(() => {
							this.setState({ showPaletteFailureModal: true });
						})}
						style={styles.button}
					>
						<label style={styles.buttonLabel} value='View Failure Details' />
					</view>
				)}
				{paletteTotalCount != null && imageCacheBufferedCount != null && (
					<label
						style={styles.paletteStatus}
						value={`${imageCacheBufferedCount} images buffered`}
					/>
				)}
			</view>

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
				{imageCacheBufferedCount != null && imageCacheBufferedBytes != null && (
					<label
						accessibilityLabel='settings-cache-usage'
						style={styles.paletteStatus}
						value={`${imageCacheBufferedCount} images in memory (${formatBytes(imageCacheBufferedBytes)})`}
					/>
				)}
				<view
					accessibilityLabel='settings-cache-clear-btn'
					contentDescription='settings-cache-clear-btn'
					onTap={this.handleClearCachePress}
					style={styles.button}
				>
					<label style={styles.buttonLabel} value='Clear Cache' />
				</view>
			</view>

			{this.state.showCacheClearModal && (
				<CacheClearModal
					onCancel={this.handleCacheClearCancel}
					onConfirm={this.handleCacheClearConfirm}
				/>
			)}

			{this.state.showCacheToast && <Toast message='Cache cleared' />}

			{this.state.showPaletteFailureModal && hasFailureDetails && (
				<Modal
					body={(paletteFailureDetails ?? []).join('\n')}
					onClose={() => this.setState({ showPaletteFailureModal: false })}
					title='Palette Failure Details'
				/>
			)}
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
	paletteError: new Style({
		...theme.text.sub,
		color: '#ff6b6b',
		marginLeft: 4,
		marginTop: 8,
	}),
	paletteStatus: new Style({
		...theme.text.sub,
		marginLeft: 4,
		marginTop: 8,
	}),
	root: new Style({
		height: '100%',
		padding: 20,
		width: '100%',
	}),
	section: new Style({
		marginBottom: 16,
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
		flexGrow: 1,
		marginLeft: 4,
	}),
	settingRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
	}),
};
