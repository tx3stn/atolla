import { Component } from 'valdi_core/src/Component';
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
import type { ToastService } from '../../services/ToastService';
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
import { version } from '../../version';
import { Button } from '../components/Button';
import { CacheClearModal } from '../components/CacheClearModal';
import { LanguageSelectModal } from '../components/LanguageSelectModal';
import { Modal } from '../components/Modal';
import { SelectOption } from '../components/SelectOption';
import { Toggle } from '../components/Toggle';
import { ViewHeader } from '../components/ViewHeader';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';

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
	downloadedTrackCount: number;
	downloadingCount: number;
	gridColumns?: number;
	imageCacheDiskBytes?: number;
	imageCacheDiskCount: number;
	imageCacheError?: string | null;
	imageCacheMaxBytes?: number;
	imageCategoryAlbumArtBlurredCount: number;
	imageCategoryAlbumArtCount: number;
	imageCategoryArtistImageCount: number;
	imageCategoryArtistLogoCount: number;
	imageCategoryGenreImageCount: number;
	imageCategoryPlaylistImageCount: number;
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
	serverName?: string;
	serverUrl?: string;
	toastService: ToastService;
	trackCacheCachedCount: number;
	trackCacheMaxTracks?: number;
	waveformReadyCount: number;
}

export class SettingsView extends Component<SettingsViewModel> {
	private handleClearCachePress = () => {
		const vm = this.viewModel;
		openSlot(vm.modalSlot, () => {
			<CacheClearModal
				animationsEnabled={vm.animationsEnabled}
				counts={{
					albumArt: vm.imageCategoryAlbumArtCount,
					albumArtBlurred: vm.imageCategoryAlbumArtBlurredCount,
					artistImage: vm.imageCategoryArtistImageCount,
					artistLogo: vm.imageCategoryArtistLogoCount,
					genreImage: vm.imageCategoryGenreImageCount,
					playlistImage: vm.imageCategoryPlaylistImageCount,
					tracks: vm.trackCacheCachedCount,
					waveformData: vm.waveformReadyCount,
				}}
				onCancel={this.handleCacheClearCancel}
				onConfirm={this.handleCacheClearConfirm}
			/>;
		});
	};

	private handleCacheClearConfirm = (selection: ClearCacheSelection) => {
		this.viewModel.onClearCache?.(selection);
		closeSlot(this.viewModel.modalSlot);
		this.viewModel.toastService.show(Strings.settingsCacheClearedToast());
	};

	private handleCacheClearCancel = () => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLogoutPress = () => {
		openSlot(this.viewModel.modalSlot, () => {
			<Modal
				animationsEnabled={this.viewModel.animationsEnabled}
				body={Strings.settingsLogoutConfirm()}
				cancelAccessibilityId='settings-logout-cancel'
				confirmAccessibilityId='settings-logout-confirm'
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
				animationsEnabled={this.viewModel.animationsEnabled}
				body={Strings.settingsDeleteAllDownloadsConfirm()}
				cancelAccessibilityId='settings-downloads-clear-cancel'
				confirmAccessibilityId='settings-downloads-clear-confirm'
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

	private handleTrackCacheLimitSelect = (count: number) => {
		this.viewModel.onTrackCacheMaxTracksChange?.(count);
	};

	private handleGridColumnsSelect = (count: number) => {
		this.viewModel.onGridColumnsChange?.(count);
	};

	private handleImageCacheSelect = (bytes: number) => {
		this.viewModel.onCacheSizeChange?.(bytes);
	};

	private handleAnimationsToggle = (enabled: boolean): void => {
		this.viewModel.onAnimationsChange?.(enabled);
	};

	private handleDebugLoggingToggle = (enabled: boolean): void => {
		this.viewModel.onDebugLoggingChange?.(enabled);
	};

	private handleClearDebugLogPress = (): void => {
		this.viewModel.onClearDebugLog?.();
		this.viewModel.toastService.show(Strings.settingsDebugLogClearedToast());
	};

	private handleExportDebugLogPress = (): void => {
		this.viewModel.onExportDebugLog?.();
	};

	private handleExportOfflineStatusPress = async (): Promise<void> => {
		await this.viewModel.onExportOfflineStatus?.();
		this.viewModel.toastService.show(Strings.settingsOfflineStatusExportedToast());
	};

	private handleDeviceIdInputChange = (value: unknown): void => {
		this.viewModel.onJellyfinDeviceIdOverrideChange?.(normalizeInputValue(value));
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
			serverName,
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
						<SelectOption
							accessibilityId='settings-grid-columns'
							label={Strings.settingsGridColumns()}
							onSelect={this.handleGridColumnsSelect}
							options={GRID_COLUMN_OPTIONS}
							selectedValue={selectedGridColumns}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionAuth()} />
					<view style={styles.section}>
						{isHttpServer && (
							<view style={styles.httpWarningCallout}>
								<label
									numberOfLines={0}
									style={styles.httpWarningCalloutText}
									value={Strings.settingsHttpWarning()}
								/>
							</view>
						)}
						<view style={styles.settingRow}>
							<label style={styles.settingLabel} value={Strings.settingsServerName()} />
							<view style={styles.authDeviceIdInlineInputContainer}>
								<textfield
									accessibilityId='settings-jellyfin-server-name-input'
									accessibilityLabel='settings-jellyfin-server-name-input'
									enabled={false}
									style={styles.authDeviceIdInput}
									value={serverName ?? ''}
								/>
							</view>
						</view>
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
						<SelectOption
							accessibilityId='settings-image-cache-size'
							formatValue={formatCacheSizeLabel}
							label={Strings.settingsImageCacheSize()}
							onSelect={this.handleImageCacheSelect}
							options={IMAGE_CACHE_SIZE_OPTIONS}
							selectedValue={selectedImageCacheSize}
						/>
						{imageCacheDiskCount != null && imageCacheDiskBytes != null && (
							<label
								accessibilityId='settings-disk-cache-usage'
								accessibilityLabel='settings-disk-cache-usage'
								style={styles.paletteStatus}
								value={Strings.imagesOnDisk(imageCacheDiskCount, formatBytes(imageCacheDiskBytes))}
							/>
						)}
						<SelectOption
							accessibilityId='settings-track-cache-limit'
							label={Strings.settingsPlayQueueCachedTracks()}
							onSelect={this.handleTrackCacheLimitSelect}
							options={TRACK_CACHE_LIMIT_OPTIONS}
							selectedValue={selectedTrackCacheLimit}
						/>
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
							value={version}
						/>
					</view>
				</view>
			</scroll>
		</layout>;
	}
}

const styles = {
	authDeviceIdInlineInputContainer: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.pill,
		flexBasis: 0,
		flexGrow: 1,
		marginLeft: 10,
		padding: theme.padding.pill,
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
		borderRadius: theme.radius.default,
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
		borderRadius: theme.radius.pill,
		flexGrow: 1,
		marginLeft: 10,
		padding: theme.padding.pill,
	}),
	paletteError: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.destructive,
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
		flexBasis: 0,
		flexGrow: 1,
		marginLeft: 4,
	}),
	settingRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		marginBottom: 4,
	}),
	trackCacheCountLabel: new Style<Label>({
		...theme.text.sub,
		marginBottom: 16,
		marginLeft: 4,
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
