import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type {
	Label,
	Layout,
	ScrollView,
	TextField,
	View,
} from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import type { ClearCacheSelection } from '../../services/ImageCache';
import type { Preferences } from '../../stores/Preferences';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_IMAGE_CACHE_MAX_BYTES,
	DEFAULT_LANGUAGE,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	GRID_COLUMN_OPTIONS,
	IMAGE_CACHE_SIZE_OPTIONS,
	LANGUAGE_OPTIONS,
	type LanguageCode,
	TRACK_CACHE_LIMIT_OPTIONS,
} from '../../stores/Preferences';
import { scrollPaddingBottom, theme, topInset, withAlpha } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { appVersion } from '../../version';
import { Button } from '../components/Button';
import { CacheClearModal } from '../components/CacheClearModal';
import { LanguageSelectModal } from '../components/LanguageSelectModal';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Toast';
import { Toggle } from '../components/Toggle';
import { ViewHeader } from '../components/ViewHeader';
import { closeSlot, openSlot } from '../flows/modalSlotFlow';

const GB = 1024 * 1024 * 1024;

function getLanguageLabel(code: LanguageCode): string {
	const opt = LANGUAGE_OPTIONS.find((o) => o.code === code);
	return opt != null ? `${opt.flag}  ${opt.name}` : code;
}

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
	connectionMode: ConnectionMode;
	debugExportPath?: string | null;
	debugLogFilePath?: string | null;
	debugLoggingEnabled?: boolean;
	defaultJellyfinDeviceId?: string;
	downloadedSizeBytes?: number;
	downloadedTrackCount?: number;
	downloadingCount: number;
	gridColumns?: number;
	imageCacheDiskBytes?: number;
	imageCacheDiskCount?: number;
	imageCacheError?: string | null;
	imageCacheMaxBytes?: number;
	imageCategoryAlbumArtBlurredCount?: number;
	imageCategoryAlbumArtCount?: number;
	imageCategoryArtistImageCount?: number;
	imageCategoryArtistLogoCount?: number;
	imageCategoryGenreImageCount?: number;
	imageCategoryPlaylistImageCount?: number;
	jellyfinDeviceIdOverride?: string;
	modalSlot?: DetachedSlot;
	offlineStatusExportPath?: string | null;
	onAnimationsChange?: (enabled: boolean) => void;
	onCacheSizeChange?: (bytes: number) => void;
	onClearCache?: (selection: ClearCacheSelection) => void;
	onClearDebugLog?: () => void;
	onClearDownloads?: () => void;
	onDebugLoggingChange?: (enabled: boolean) => void;
	onExportDebugLog?: () => void;
	onExportOfflineStatus?: () => void | Promise<void>;
	onGridColumnsChange?: (count: number) => void;
	onJellyfinDeviceIdOverrideChange?: (value: string) => void;
	onLanguageChange?: (code: LanguageCode) => void;
	onLogout?: () => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onTrackCacheMaxTracksChange?: (count: number) => void;
	preferences: Preferences;
	selectedLanguage?: LanguageCode;
	serverUrl?: string;
	trackCacheCachedCount?: number;
	trackCacheMaxTracks?: number;
	waveformCount?: number;
	waveformReadyCount?: number;
}

interface SettingsState {
	showGridColumnsOptions: boolean;
	showImageCacheOptions: boolean;
	showTrackCacheLimitOptions: boolean;
	toastMessage: string | null;
}

export class SettingsView extends StatefulComponent<SettingsViewModel, SettingsState> {
	state: SettingsState = {
		showGridColumnsOptions: false,
		showImageCacheOptions: false,
		showTrackCacheLimitOptions: false,
		toastMessage: null,
	};

	private toastTimer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(): void {
		if (this.toastTimer != null) {
			clearTimeout(this.toastTimer);
		}
	}

	private showToast = (message: string): void => {
		if (this.toastTimer != null) {
			clearTimeout(this.toastTimer);
		}
		this.setState({ toastMessage: message });
		this.toastTimer = setTimeout(() => {
			this.setState({ toastMessage: null });
		}, 2500);
	};

	private handleClearCachePress = () => {
		const vm = this.viewModel;
		openSlot(vm.modalSlot, () => {
			<CacheClearModal
				counts={{
					albumArt:
						vm.imageCategoryAlbumArtCount != null
							? { total: vm.imageCategoryAlbumArtCount }
							: undefined,
					albumArtBlurred:
						vm.imageCategoryAlbumArtBlurredCount != null
							? { total: vm.imageCategoryAlbumArtBlurredCount }
							: undefined,
					artistImage:
						vm.imageCategoryArtistImageCount != null
							? { total: vm.imageCategoryArtistImageCount }
							: undefined,
					artistLogo:
						vm.imageCategoryArtistLogoCount != null
							? { total: vm.imageCategoryArtistLogoCount }
							: undefined,
					genreImage:
						vm.imageCategoryGenreImageCount != null
							? { total: vm.imageCategoryGenreImageCount }
							: undefined,
					playlistImage:
						vm.imageCategoryPlaylistImageCount != null
							? { total: vm.imageCategoryPlaylistImageCount }
							: undefined,
					tracks:
						vm.trackCacheCachedCount != null ? { total: vm.trackCacheCachedCount } : undefined,
					waveformData:
						vm.waveformCount != null
							? { ready: vm.waveformReadyCount, total: vm.waveformCount }
							: undefined,
				}}
				onCancel={this.handleCacheClearCancel}
				onConfirm={this.handleCacheClearConfirm}
			/>;
		});
	};

	private handleCacheClearConfirm = (selection: ClearCacheSelection) => {
		this.viewModel.onClearCache?.(selection);
		closeSlot(this.viewModel.modalSlot);
		this.showToast(Strings.settingsCacheClearedToast());
	};

	private handleCacheClearCancel = () => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLogoutPress = () => {
		openSlot(this.viewModel.modalSlot, () => {
			<Modal
				body={Strings.settingsLogoutConfirm()}
				cancelAccessibilityId='settings-logout-cancel-btn'
				confirmAccessibilityId='settings-logout-confirm-btn'
				modalAccessibilityId='settings-logout-modal'
				onClose={this.handleLogoutCancel}
				onConfirm={this.handleLogoutConfirm}
				title={Strings.settingsLogoutButton()}
			/>;
		});
	};

	private handleLogoutConfirm = () => {
		this.viewModel.onLogout?.();
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLogoutCancel = () => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleClearDownloadsPress = () => {
		openSlot(this.viewModel.modalSlot, () => {
			<Modal
				body={Strings.settingsDeleteAllDownloadsConfirm()}
				cancelAccessibilityId='settings-downloads-clear-cancel-btn'
				confirmAccessibilityId='settings-downloads-clear-confirm-btn'
				modalAccessibilityId='settings-downloads-clear-modal'
				onClose={this.handleClearDownloadsCancel}
				onConfirm={this.handleClearDownloadsConfirm}
				title={Strings.settingsDeleteAllDownloadsButton()}
			/>;
		});
	};

	private handleClearDownloadsConfirm = () => {
		this.viewModel.onClearDownloads?.();
		closeSlot(this.viewModel.modalSlot);
	};

	private handleClearDownloadsCancel = () => {
		closeSlot(this.viewModel.modalSlot);
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

	private handleAnimationsToggle = (enabled: boolean): void => {
		this.viewModel.onAnimationsChange?.(enabled);
	};

	private handleDebugLoggingToggle = (enabled: boolean): void => {
		this.viewModel.onDebugLoggingChange?.(enabled);
	};

	private handleClearDebugLogPress = (): void => {
		this.viewModel.onClearDebugLog?.();
		this.showToast(Strings.settingsDebugLogClearedToast());
	};

	private handleExportDebugLogPress = (): void => {
		this.viewModel.onExportDebugLog?.();
	};

	private handleExportOfflineStatusPress = async (): Promise<void> => {
		await this.viewModel.onExportOfflineStatus?.();
		this.showToast(Strings.settingsOfflineStatusExportedToast());
	};

	private handleDeviceIdInputChange = (value: unknown): void => {
		this.viewModel.onJellyfinDeviceIdOverrideChange?.(normalizeInputValue(value));
	};

	private gridColumnOptionTapHandlers = new Map<number, () => void>();
	private imageCacheOptionTapHandlers = new Map<number, () => void>();
	private trackCacheOptionTapHandlers = new Map<number, () => void>();

	private getGridColumnOptionTapHandler = (option: number): (() => void) => {
		const existing = this.gridColumnOptionTapHandlers.get(option);
		if (existing) return existing;
		const handler = (): void => {
			this.handleGridColumnsSelect(option);
		};
		this.gridColumnOptionTapHandlers.set(option, handler);
		return handler;
	};

	private getImageCacheOptionTapHandler = (option: number): (() => void) => {
		const existing = this.imageCacheOptionTapHandlers.get(option);
		if (existing) return existing;
		const handler = (): void => {
			this.handleImageCacheSelect(option);
		};
		this.imageCacheOptionTapHandlers.set(option, handler);
		return handler;
	};

	private getTrackCacheOptionTapHandler = (option: number): (() => void) => {
		const existing = this.trackCacheOptionTapHandlers.get(option);
		if (existing) return existing;
		const handler = (): void => {
			this.handleTrackCacheLimitSelect(option);
		};
		this.trackCacheOptionTapHandlers.set(option, handler);
		return handler;
	};

	private handleLanguagePress = () => {
		const selectedLanguage = this.viewModel.selectedLanguage ?? DEFAULT_LANGUAGE;
		openSlot(this.viewModel.modalSlot, () => {
			<LanguageSelectModal
				onCancel={this.handleLanguageCancel}
				onSelect={this.handleLanguageSelect}
				selectedLanguage={selectedLanguage}
			/>;
		});
	};

	private handleLanguageSelect = (code: LanguageCode) => {
		this.viewModel.onLanguageChange?.(code);
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLanguageCancel = () => {
		closeSlot(this.viewModel.modalSlot);
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
			serverUrl,
			trackCacheMaxTracks,
		} = this.viewModel;
		const isHttpServer = typeof serverUrl === 'string' && /^http:\/\//i.test(serverUrl);
		const selectedGridColumns = gridColumns ?? DEFAULT_GRID_COLUMNS;
		const selectedTrackCacheLimit = trackCacheMaxTracks ?? DEFAULT_TRACK_CACHE_MAX_TRACKS;
		const selectedImageCacheSize =
			this.viewModel.imageCacheMaxBytes ?? DEFAULT_IMAGE_CACHE_MAX_BYTES;
		const selectedLanguage = this.viewModel.selectedLanguage ?? DEFAULT_LANGUAGE;

		<layout style={styles.viewRoot}>
			<ViewHeader
				animationsEnabled={animationsEnabled}
				connectionMode={this.viewModel.connectionMode}
				onRequestModeChange={this.viewModel.onRequestModeChange}
				title={Strings.settingsTitle()}
			/>
			<scroll style={createScrollStyle()}>
				<view style={styles.root}>
					<label style={styles.sectionTitle} value={Strings.settingsSectionAppearance()} />
					<view style={styles.section}>
						<view style={styles.settingRow}>
							<label style={styles.settingLabel} value={Strings.settingsAnimations()} />
							<Toggle
								accessibilityId='settings-animations-toggle'
								enabled={animationsEnabled}
								onToggle={this.handleAnimationsToggle}
							/>
						</view>
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsGridColumns()} />
							<view
								accessibilityId='settings-grid-columns-dropdown'
								accessibilityLabel='settings-grid-columns-dropdown'
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
										accessibilityId={`settings-grid-columns-option-${option}`}
										onTap={this.getGridColumnOptionTapHandler(option)}
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

					<label style={styles.sectionTitle} value={Strings.settingsSectionAuth()} />
					<view style={styles.section}>
						{isHttpServer && (
							<view style={styles.httpWarningCallout}>
								<label
									style={styles.httpWarningCalloutText}
									value={Strings.settingsHttpWarning()}
								/>
							</view>
						)}
						<view style={styles.settingRow}>
							<label style={styles.settingLabel} value={Strings.settingsDeviceId()} />
							<view style={styles.authDeviceIdInlineInputContainer}>
								<textfield
									accessibilityId='settings-jellyfin-device-id-input'
									accessibilityLabel='settings-jellyfin-device-id-input'
									autocapitalization='none'
									onChange={this.handleDeviceIdInputChange}
									placeholder={defaultJellyfinDeviceId ?? Strings.settingsDeviceIdPlaceholder()}
									style={styles.authDeviceIdInput}
									value={jellyfinDeviceIdOverride ?? ''}
								/>
							</view>
						</view>
						<Button
							accessibilityId='settings-logout'
							label={Strings.settingsLogoutButton()}
							onTap={this.handleLogoutPress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionCache()} />
					<view style={styles.section}>
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsImageCacheSize()} />
							<view
								accessibilityId='settings-image-cache-size-dropdown'
								accessibilityLabel='settings-image-cache-size-dropdown'
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
										accessibilityId={`settings-image-cache-size-option-${option}`}
										onTap={this.getImageCacheOptionTapHandler(option)}
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
								accessibilityId='settings-disk-cache-usage'
								accessibilityLabel='settings-disk-cache-usage'
								style={styles.paletteStatus}
								value={Strings.imagesOnDisk(imageCacheDiskCount, formatBytes(imageCacheDiskBytes))}
							/>
						)}
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsPlayQueueCachedTracks()} />
							<view
								accessibilityId='settings-track-cache-limit-dropdown'
								accessibilityLabel='settings-track-cache-limit-dropdown'
								onTap={this.handleTrackCacheLimitToggle}
								style={styles.trackCacheLimitButton}
							>
								<label
									style={styles.trackCacheLimitButtonLabel}
									value={`${selectedTrackCacheLimit}`}
								/>
							</view>
						</view>
						{this.state.showTrackCacheLimitOptions && (
							<view style={styles.trackCacheLimitOptionsList}>
								{TRACK_CACHE_LIMIT_OPTIONS.map((option) => (
									<view
										accessibilityId={`settings-track-cache-limit-option-${option}`}
										onTap={this.getTrackCacheOptionTapHandler(option)}
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
							accessibilityId='settings-cache-clear'
							label={Strings.settingsClearCacheButton()}
							onTap={this.handleClearCachePress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionDebug()} />
					<view style={styles.section}>
						<view style={styles.settingRow}>
							<label style={styles.settingLabel} value={Strings.settingsDebugLogging()} />
							<Toggle
								accessibilityId='settings-debug-logging-toggle'
								enabled={this.viewModel.debugLoggingEnabled ?? false}
								onToggle={this.handleDebugLoggingToggle}
							/>
						</view>
						{this.viewModel.debugLogFilePath != null && (
							<label
								accessibilityId='settings-debug-log-path'
								accessibilityLabel='settings-debug-log-path'
								numberOfLines={2}
								style={styles.debugLogPathLabel}
								value={Strings.settingsDebugLogFilePath(this.viewModel.debugLogFilePath)}
							/>
						)}
						{(this.viewModel.debugLoggingEnabled ?? false) && (
							<Button
								accessibilityId='settings-debug-log-export'
								label={Strings.settingsDebugLogExportButton()}
								onTap={this.handleExportDebugLogPress}
							/>
						)}
						{this.viewModel.debugExportPath != null && (
							<label
								accessibilityId='settings-debug-export-path'
								accessibilityLabel='settings-debug-export-path'
								numberOfLines={2}
								style={styles.debugLogPathLabel}
								value={Strings.settingsDebugLogExportedPath(this.viewModel.debugExportPath)}
							/>
						)}
						{(this.viewModel.debugLoggingEnabled ?? false) && (
							<Button
								accessibilityId='settings-debug-log-clear'
								label={Strings.settingsDebugLogClearButton()}
								onTap={this.handleClearDebugLogPress}
							/>
						)}
						<Button
							accessibilityId='settings-export-offline-status'
							label={Strings.settingsExportOfflineStatusButton()}
							onTap={this.handleExportOfflineStatusPress}
						/>
						{this.viewModel.offlineStatusExportPath != null && (
							<label
								accessibilityId='settings-offline-status-export-path'
								accessibilityLabel='settings-offline-status-export-path'
								numberOfLines={2}
								style={styles.debugLogPathLabel}
								value={Strings.settingsOfflineStatusExportedPath(
									this.viewModel.offlineStatusExportPath,
								)}
							/>
						)}
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionDownloads()} />
					<view style={styles.section}>
						<label
							accessibilityId='settings-downloaded-track-count'
							accessibilityLabel='settings-downloaded-track-count'
							style={styles.trackCacheCountLabel}
							value={Strings.tracksDownloaded(
								downloadedTrackCount ?? 0,
								formatBytes(downloadedSizeBytes ?? 0),
							)}
						/>
						<Button
							accessibilityId='settings-downloads-delete-all'
							label={Strings.settingsDeleteAllDownloadsButton()}
							onTap={this.handleClearDownloadsPress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionLanguage()} />
					<view style={styles.section}>
						<Button
							accessibilityId='settings-language-selector'
							label={getLanguageLabel(selectedLanguage)}
							onTap={this.handleLanguagePress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionVersion()} />
					<view style={styles.section}>
						<label
							accessibilityId='settings-app-version'
							accessibilityLabel='settings-app-version'
							style={styles.versionLabel}
							value={appVersion}
						/>
					</view>
				</view>
			</scroll>
			{this.state.toastMessage != null && <Toast message={this.state.toastMessage} />}
		</layout>;
	}
}

const styles = {
	authDeviceIdInlineInputContainer: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 999,
		flexGrow: 1,
		marginLeft: 10,
		paddingBottom: 10,
		paddingLeft: 10,
		paddingRight: 10,
		paddingTop: 10,
	}),
	authDeviceIdInput: new Style<TextField>({
		...theme.text.main,
		marginLeft: 18,
		width: '100%',
	}),
	debugLogPathLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.muted,
		marginLeft: 4,
		marginTop: 8,
	}),
	httpWarningCallout: new Style({
		backgroundColor: withAlpha(theme.colors.warning, 0.12),
		borderColor: theme.colors.warning,
		borderLeftWidth: 3,
		borderRadius: 6,
		marginBottom: 12,
		padding: 12,
	}),
	httpWarningCalloutText: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.warning,
	}),
	languageSelectorButton: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 999,
		flexGrow: 1,
		marginLeft: 10,
		paddingBottom: 10,
		paddingLeft: 18,
		paddingRight: 18,
		paddingTop: 10,
	}),
	paletteError: new Style<Label>({
		...theme.text.sub,
		color: '#ff6b6b',
		marginLeft: 4,
		marginTop: 8,
	}),
	paletteStatus: new Style<Label>({
		...theme.text.sub,
		marginBottom: 10,
		marginLeft: 4,
		marginTop: 12,
	}),
	root: new Style<View>({
		marginTop: 12,
		paddingLeft: 8,
		paddingRight: 8,
		width: '100%',
	}),
	section: new Style<View>({
		marginBottom: 16,
		marginTop: 8,
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mutedHeader,
		letterSpacing: 1,
		marginBottom: 4,
		marginLeft: 4,
		marginRight: 4,
		marginTop: 4,
	}),
	settingLabel: new Style<Label>({
		...theme.text.sub,
		flexGrow: 1,
		marginLeft: 4,
	}),
	settingRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
	}),
	trackCacheCountLabel: new Style<Label>({
		...theme.text.sub,
		marginBottom: 16,
		marginLeft: 4,
	}),
	trackCacheLimitButton: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		minWidth: 84,
		paddingBottom: 12,
		paddingLeft: 18,
		paddingRight: 18,
		paddingTop: 12,
	}),
	trackCacheLimitButtonLabel: new Style<Label>({
		...theme.text.main,
	}),
	trackCacheLimitContainer: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		marginTop: 10,
	}),
	trackCacheLimitOption: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		flexGrow: 1,
		marginRight: 8,
		paddingBottom: 8,
		paddingTop: 8,
	}),
	trackCacheLimitOptionLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.bg,
	}),
	trackCacheLimitOptionSelected: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: theme.borderRadius,
		flexGrow: 1,
		marginRight: 8,
		paddingBottom: 8,
		paddingTop: 8,
	}),
	trackCacheLimitOptionsList: new Style<Layout>({
		flexDirection: 'row',
		marginTop: 10,
		width: '100%',
	}),
	versionLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.muted,
		marginLeft: 4,
	}),
	viewRoot: new Style<Layout>({
		flexGrow: 1,
		width: '100%',
	}),
};

function createScrollStyle(): Style<ScrollView> {
	return new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: scrollPaddingBottom(true),
		paddingTop: theme.headerHeight + topInset,
		width: '100%',
	});
}
