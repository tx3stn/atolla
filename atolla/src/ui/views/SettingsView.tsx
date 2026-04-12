// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ClearCacheSelection } from '../../services/ImageCache';
import type { Preferences } from '../../stores/Preferences';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_IMAGE_CACHE_MAX_BYTES,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	GRID_COLUMN_OPTIONS,
	IMAGE_CACHE_SIZE_OPTIONS,
	TRACK_CACHE_LIMIT_OPTIONS,
} from '../../stores/Preferences';
import { theme } from '../../theme';
import { Button } from '../components/Button';
import { CacheClearModal } from '../components/CacheClearModal';
import { Toast } from '../components/Toast';
import { Toggle } from '../components/Toggle';

const GB = 1024 * 1024 * 1024;

function formatCacheSizeLabel(bytes: number): string {
	const gb = bytes / GB;
	if (gb < 1) return `${Math.round(bytes / (1024 * 1024))} MB`;
	return `${gb} GB`;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 MB';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < GB) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / GB).toFixed(2)} GB`;
}

function normalizeInputValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (value && typeof value === 'object') {
		const candidate = value as {
			nativeEvent?: { text?: unknown; value?: unknown };
			query?: unknown;
			text?: unknown;
			value?: unknown;
		};

		const raw =
			candidate.nativeEvent?.text ??
			candidate.nativeEvent?.value ??
			candidate.query ??
			candidate.text ??
			candidate.value;
		if (typeof raw === 'string') {
			return raw;
		}
	}

	if (value == null) {
		return '';
	}

	return String(value);
}

export interface SettingsViewModel {
	animationsEnabled: boolean;
	defaultJellyfinDeviceId?: string;
	downloadedSizeBytes?: number;
	downloadedTrackCount?: number;
	gridColumns?: number;
	imageCacheDiskBytes?: number;
	imageCacheDiskCount?: number;
	imageCacheError?: string | null;
	imageCacheMaxBytes?: number;
	jellyfinDeviceIdOverride?: string;
	onAnimationsChange?: (enabled: boolean) => void;
	onCacheSizeChange?: (bytes: number) => void;
	onClearCache?: (selection: ClearCacheSelection) => void;
	onGridColumnsChange?: (count: number) => void;
	onJellyfinDeviceIdOverrideChange?: (value: string) => void;
	onLogout?: () => void;
	onTrackCacheMaxTracksChange?: (count: number) => void;
	preferences: Preferences;
	trackCacheCachedCount?: number;
	trackCacheMaxTracks?: number;
}

interface SettingsState {
	showCacheClearModal: boolean;
	showCacheToast: boolean;
	showGridColumnsOptions: boolean;
	showImageCacheOptions: boolean;
	showTrackCacheLimitOptions: boolean;
}

export class SettingsView extends StatefulComponent<SettingsViewModel, SettingsState> {
	state: SettingsState = {
		showCacheClearModal: false,
		showCacheToast: false,
		showGridColumnsOptions: false,
		showImageCacheOptions: false,
		showTrackCacheLimitOptions: false,
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

	private handleTrackCacheLimitToggle = () => {
		this.setState({ showTrackCacheLimitOptions: !this.state.showTrackCacheLimitOptions });
	};

	private handleTrackCacheLimitSelect = (count: number) => {
		this.viewModel.onTrackCacheMaxTracksChange?.(count);
		this.setState({ showTrackCacheLimitOptions: false });
	};

	private handleGridColumnsToggle = () => {
		this.setState({ showGridColumnsOptions: !this.state.showGridColumnsOptions });
	};

	private handleGridColumnsSelect = (count: number) => {
		this.viewModel.onGridColumnsChange?.(count);
		this.setState({ showGridColumnsOptions: false });
	};

	private handleImageCacheToggle = () => {
		this.setState({ showImageCacheOptions: !this.state.showImageCacheOptions });
	};

	private handleImageCacheSelect = (bytes: number) => {
		this.viewModel.onCacheSizeChange?.(bytes);
		this.setState({ showImageCacheOptions: false });
	};

	onRender(): void {
		const {
			animationsEnabled,
			defaultJellyfinDeviceId,
			downloadedSizeBytes,
			downloadedTrackCount,
			gridColumns,
			imageCacheDiskBytes,
			imageCacheDiskCount,
			jellyfinDeviceIdOverride,
			onAnimationsChange,
			onJellyfinDeviceIdOverrideChange,
			trackCacheCachedCount,
			trackCacheMaxTracks,
		} = this.viewModel;
		const selectedGridColumns = gridColumns ?? DEFAULT_GRID_COLUMNS;
		const selectedTrackCacheLimit = trackCacheMaxTracks ?? DEFAULT_TRACK_CACHE_MAX_TRACKS;
		const selectedImageCacheSize =
			this.viewModel.imageCacheMaxBytes ?? DEFAULT_IMAGE_CACHE_MAX_BYTES;

		<view style={styles.root}>
			<view style={styles.pageHeaderRow}>
				<label style={styles.pageTitle} value='SETTINGS' />
				<image src={res.logo} style={styles.pageHeaderLogo} />
			</view>
			<label style={styles.sectionTitle} value='APPEARANCE' />
			<view style={styles.section}>
				<view style={styles.settingRow}>
					<label style={styles.settingLabel} value='animations' />
					<Toggle
						accessibilityLabel='settings-animations-toggle'
						enabled={animationsEnabled}
						onToggle={(enabled) => onAnimationsChange?.(enabled)}
					/>
				</view>
				<view style={styles.trackCacheLimitContainer}>
					<label style={styles.settingLabel} value='grid columns' />
					<view
						accessibilityLabel='settings-grid-columns-dropdown'
						contentDescription='settings-grid-columns-dropdown'
						onTap={this.handleGridColumnsToggle}
						style={styles.trackCacheLimitButton}
					>
						<label style={styles.trackCacheLimitButtonLabel} value={`${selectedGridColumns}`} />
					</view>
				</view>
				{this.state.showGridColumnsOptions && (
					<view style={styles.trackCacheLimitOptionsList}>
						{GRID_COLUMN_OPTIONS.map((option) => (
							<view
								accessibilityLabel={`settings-grid-columns-option-${option}`}
								contentDescription={`settings-grid-columns-option-${option}`}
								onTap={() => this.handleGridColumnsSelect(option)}
								style={
									option === selectedGridColumns
										? styles.trackCacheLimitOptionSelected
										: styles.trackCacheLimitOption
								}
							>
								<label style={styles.trackCacheLimitOptionLabel} value={`${option}`} />
							</view>
						))}
					</view>
				)}
			</view>

			<label style={styles.sectionTitle} value='CACHE' />
			<view style={styles.section}>
				<view style={styles.trackCacheLimitContainer}>
					<label style={styles.settingLabel} value='image cache size' />
					<view
						accessibilityLabel='settings-image-cache-size-dropdown'
						contentDescription='settings-image-cache-size-dropdown'
						onTap={this.handleImageCacheToggle}
						style={styles.trackCacheLimitButton}
					>
						<label
							style={styles.trackCacheLimitButtonLabel}
							value={formatCacheSizeLabel(selectedImageCacheSize)}
						/>
					</view>
				</view>
				{this.state.showImageCacheOptions && (
					<view style={styles.trackCacheLimitOptionsList}>
						{IMAGE_CACHE_SIZE_OPTIONS.map((option) => (
							<view
								accessibilityLabel={`settings-image-cache-size-option-${option}`}
								contentDescription={`settings-image-cache-size-option-${option}`}
								onTap={() => this.handleImageCacheSelect(option)}
								style={
									option === selectedImageCacheSize
										? styles.trackCacheLimitOptionSelected
										: styles.trackCacheLimitOption
								}
							>
								<label
									style={styles.trackCacheLimitOptionLabel}
									value={formatCacheSizeLabel(option)}
								/>
							</view>
						))}
					</view>
				)}
				{imageCacheDiskCount != null && imageCacheDiskBytes != null && (
					<label
						accessibilityLabel='settings-disk-cache-usage'
						style={styles.paletteStatus}
						value={`${imageCacheDiskCount} images on disk      [ ${formatBytes(imageCacheDiskBytes)} ]`}
					/>
				)}
				<view style={styles.trackCacheLimitContainer}>
					<label style={styles.settingLabel} value='play queue cached tracks' />
					<view
						accessibilityLabel='settings-track-cache-limit-dropdown'
						contentDescription='settings-track-cache-limit-dropdown'
						onTap={this.handleTrackCacheLimitToggle}
						style={styles.trackCacheLimitButton}
					>
						<label style={styles.trackCacheLimitButtonLabel} value={`${selectedTrackCacheLimit}`} />
					</view>
				</view>
				<label
					accessibilityLabel='settings-track-cache-count'
					style={styles.trackCacheCountLabel}
					value={`${trackCacheCachedCount ?? 0} tracks currently cached`}
				/>
				{this.state.showTrackCacheLimitOptions && (
					<view style={styles.trackCacheLimitOptionsList}>
						{TRACK_CACHE_LIMIT_OPTIONS.map((option) => (
							<view
								accessibilityLabel={`settings-track-cache-limit-option-${option}`}
								contentDescription={`settings-track-cache-limit-option-${option}`}
								onTap={() => this.handleTrackCacheLimitSelect(option)}
								style={
									option === selectedTrackCacheLimit
										? styles.trackCacheLimitOptionSelected
										: styles.trackCacheLimitOption
								}
							>
								<label style={styles.trackCacheLimitOptionLabel} value={`${option}`} />
							</view>
						))}
					</view>
				)}
				<Button
					accessibilityLabel='settings-cache-clear'
					label='clear cache'
					onTap={this.handleClearCachePress}
					style={styles.button}
				/>
			</view>

			<label style={styles.sectionTitle} value='DOWNLOADS' />
			<view style={styles.section}>
				<label
					accessibilityLabel='settings-downloaded-track-count'
					style={styles.trackCacheCountLabel}
					value={`${downloadedTrackCount ?? 0} tracks downloaded      [ ${formatBytes(downloadedSizeBytes)} ]`}
				/>
			</view>

			<label style={styles.sectionTitle} value='AUTH' />
			<view style={styles.section}>
				<view style={styles.settingRow}>
					<label style={styles.settingLabel} value='device id' />
					<view style={styles.authDeviceIdInlineInputContainer}>
						<textfield
							accessibilityLabel='settings-jellyfin-device-id-input'
							autocapitalization='none'
							contentDescription='settings-jellyfin-device-id-input'
							onChange={(value: unknown) => {
								onJellyfinDeviceIdOverrideChange?.(normalizeInputValue(value));
							}}
							placeholder={defaultJellyfinDeviceId ?? 'atolla'}
							style={styles.authDeviceIdInput}
							value={jellyfinDeviceIdOverride ?? ''}
						/>
					</view>
				</view>
				<Button
					accessibilityLabel='settings-logout'
					label='logout'
					onTap={createReusableCallback(() => this.viewModel.onLogout?.())}
				/>
			</view>

			{this.state.showCacheClearModal && (
				<CacheClearModal
					onCancel={this.handleCacheClearCancel}
					onConfirm={this.handleCacheClearConfirm}
				/>
			)}

			{this.state.showCacheToast && <Toast message='cache cleared' />}
		</view>;
	}
}

const styles = {
	authDeviceIdInlineInputContainer: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 999,
		flexGrow: 1,
		marginLeft: 10,
		paddingBottom: 10,
		paddingLeft: 10,
		paddingRight: 10,
		paddingTop: 10,
	}),
	authDeviceIdInput: new Style({
		...theme.text.main,
		marginLeft: 18,
		width: '100%',
	}),
	pageHeaderLogo: new Style({
		height: 65,
		width: 65,
	}),
	pageHeaderRow: new Style({
		alignItems: 'flex-start',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 15,
	}),
	pageTitle: new Style({
		...theme.text.display,
		marginLeft: 4,
	}),
	paletteError: new Style({
		...theme.text.sub,
		color: '#ff6b6b',
		marginLeft: 4,
		marginTop: 8,
	}),
	paletteStatus: new Style({
		...theme.text.sub,
		marginBottom: 10,
		marginLeft: 4,
		marginTop: 12,
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
		...theme.text.mutedHeader,
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
	trackCacheCountLabel: new Style({
		...theme.text.sub,
		marginLeft: 4,
		paddingBottom: 16,
	}),
	trackCacheLimitButton: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		minWidth: 84,
		paddingBottom: 12,
		paddingLeft: 18,
		paddingRight: 18,
		paddingTop: 12,
	}),
	trackCacheLimitButtonLabel: new Style({
		...theme.text.main,
	}),
	trackCacheLimitContainer: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		marginTop: 10,
	}),
	trackCacheLimitOption: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		flexGrow: 1,
		marginRight: 8,
		paddingBottom: 8,
		paddingTop: 8,
	}),
	trackCacheLimitOptionLabel: new Style({
		...theme.text.sub,
	}),
	trackCacheLimitOptionSelected: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: theme.borderRadius,
		flexGrow: 1,
		marginRight: 8,
		paddingBottom: 8,
		paddingTop: 8,
	}),
	trackCacheLimitOptionsList: new Style({
		flexDirection: 'row',
		marginTop: 10,
		width: '100%',
	}),
};
