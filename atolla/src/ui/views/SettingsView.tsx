import { StatefulComponent } from 'valdi_core/src/Component';
import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type {
	Label,
	Layout,
	ScrollView,
	TextField,
	View,
} from 'valdi_tsx/src/NativeTemplateElements';
import {
	clearAtollaNativeCacheCategories,
	requestAtollaImageLoaderDiskCacheStats,
	setAtollaImageLoaderDiskCacheMaxBytes,
} from '../../ImageLoaderBootstrap';
import Strings from '../../Strings';
import type { ArtworkPaletteService } from '../../services/ArtworkPaletteService';
import type { DownloadService } from '../../services/DownloadService';
import type { ClearCacheSelection } from '../../services/ImageCache';
import { Logger } from '../../services/Logger';
import type { PlaybackOrchestrator } from '../../services/PlaybackOrchestrator';
import type { SessionController } from '../../services/SessionController';
import type { ToastService } from '../../services/ToastService';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_IMAGE_CACHE_MAX_BYTES,
	DEFAULT_LANGUAGE,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	GRID_COLUMN_OPTIONS,
	IMAGE_CACHE_SIZE_OPTIONS,
	LANGUAGE_OPTIONS,
	type LanguageCode,
	type Preferences,
	TRACK_CACHE_LIMIT_OPTIONS,
} from '../../stores/Preferences';
import {
	clearAtollaTrackCache,
	getAtollaTrackCacheEntryCount,
	setAtollaTrackCacheMaxTracks,
} from '../../TrackPlaybackNative';
import { theme, withAlpha } from '../../theme';
import { version } from '../../version';
import { Button } from '../components/Button';
import { CacheClearModal } from '../components/CacheClearModal';
import { LanguageSelectModal } from '../components/LanguageSelectModal';
import { Modal } from '../components/Modal';
import { SelectOption } from '../components/SelectOption';
import { Toggle } from '../components/Toggle';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';

const GB = 1024 * 1024 * 1024;
const NATIVE_CACHE_STATS_INTERVAL_MS = 1000;

export interface SettingsViewModel {
	downloadService: DownloadService;
	modalSlot: DetachedSlot;
	paletteService: ArtworkPaletteService;
	playbackOrchestrator: PlaybackOrchestrator;
	preferences: Preferences;
	sessionController: SessionController;
	toastService: ToastService;
	visible: boolean;
}

interface SettingsViewState {
	debugExportPath: string | null;
	imageCacheDiskBytes: number | null;
	imageCacheDiskCount: number;
	imageCategoryCounts: Record<string, number>;
	revision: number;
	trackCacheCachedCount: number;
}

export class SettingsView extends StatefulComponent<SettingsViewModel, SettingsViewState> {
	private statsInterval?: ReturnType<typeof setInterval>;

	state: SettingsViewState = {
		debugExportPath: null,
		imageCacheDiskBytes: null,
		imageCacheDiskCount: 0,
		imageCategoryCounts: {},
		revision: 0,
		trackCacheCachedCount: 0,
	};

	onCreate(): void {
		this.registerDisposable(this.viewModel.preferences.subscribe(this.bump));
		this.registerDisposable(this.viewModel.downloadService.subscribe(this.bump));
		if (this.viewModel.visible) {
			this.startStatsPolling();
		}
	}

	onDestroy(): void {
		this.stopStatsPolling();
	}

	onRender(): void {
		const serverName = this.viewModel.sessionController.serverName() ?? '';
		const serverUrl = this.viewModel.sessionController.serverUrl();
		const isHttpServer = typeof serverUrl === 'string' && /^http:\/\//i.test(serverUrl);
		const selectedGridColumns = this.viewModel.preferences.gridColumns ?? DEFAULT_GRID_COLUMNS;
		const selectedTrackCacheLimit =
			this.viewModel.preferences.trackCacheMaxTracks ?? DEFAULT_TRACK_CACHE_MAX_TRACKS;
		const selectedImageCacheSize =
			this.viewModel.preferences.imageCacheMaxBytes ?? DEFAULT_IMAGE_CACHE_MAX_BYTES;
		const selectedLanguage = this.viewModel.preferences.language ?? DEFAULT_LANGUAGE;
		const debugLoggingEnabled = this.viewModel.preferences.debugLoggingEnabled;
		const downloadedTrackCount = this.viewModel.downloadService.getDownloadedTrackCount();
		const downloadedSizeBytes = this.viewModel.downloadService.getTotalDownloadedSizeBytes();
		const { imageCacheDiskBytes, imageCacheDiskCount } = this.state;

		<layout style={styles.viewRoot}>
			<scroll style={styles.scroll}>
				<view style={styles.root}>
					<label style={styles.sectionTitle} value={Strings.settingsSectionAppearance()} />
					<view style={styles.section}>
						<view style={styles.settingRow}>
							<label style={styles.settingLabel} value={Strings.settingsAnimations()} />
							<Toggle
								accessibilityId='settings-animations-toggle'
								enabled={this.viewModel.preferences.animationsEnabled}
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
									value={serverName}
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
									placeholder={
										this.viewModel.sessionController.defaultDeviceId() ||
										Strings.settingsDeviceIdPlaceholder()
									}
									style={styles.authDeviceIdInput}
									value={this.viewModel.preferences.jellyfinClientDeviceIdOverride ?? ''}
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
								enabled={debugLoggingEnabled}
								onToggle={this.handleDebugLoggingToggle}
							/>
						</view>
						{debugLoggingEnabled && (
							<Button
								accessibilityId='settings-debug-log-export'
								label={Strings.settingsDebugLogExportButton()}
								onTap={this.handleExportDebugLogPress}
							/>
						)}
						{this.state.debugExportPath != null && (
							<label
								accessibilityId='settings-debug-export-path'
								accessibilityLabel='settings-debug-export-path'
								numberOfLines={2}
								style={styles.debugLogPathLabel}
								value={Strings.settingsDebugLogExportedPath(this.state.debugExportPath)}
							/>
						)}
						{debugLoggingEnabled && (
							<Button
								accessibilityId='settings-debug-log-clear'
								label={Strings.settingsDebugLogClearButton()}
								onTap={this.handleClearDebugLogPress}
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

	onViewModelUpdate(prevViewModel?: SettingsViewModel): void {
		if (!prevViewModel) {
			return;
		}
		if (prevViewModel.visible === this.viewModel.visible) {
			return;
		}
		if (this.viewModel.visible) {
			this.startStatsPolling();
		} else {
			this.stopStatsPolling();
		}
	}

	private applyTrackCacheLimit(maxTracks: number): void {
		if (!Number.isFinite(maxTracks) || maxTracks <= 0) {
			return;
		}
		try {
			setAtollaTrackCacheMaxTracks(maxTracks);
		} catch {
			// native track cache limit unavailable on non-Android targets
		}
	}

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private handleAnimationsToggle = (enabled: boolean): void => {
		void this.viewModel.preferences.setAnimationsEnabled(enabled);
	};

	private handleCacheClearCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleCacheClearConfirm = (selection: ClearCacheSelection): void => {
		const categories: Array<string> = [];
		if (selection.albumArt) categories.push('album_art', 'album_art_thumb');
		if (selection.albumArtBlurred) categories.push('album_art_blurred');
		if (selection.artistImage) categories.push('artist_image', 'artist_image_thumb');
		if (selection.artistLogo) categories.push('artist_logo');
		if (selection.genreImage) categories.push('genre_art');
		if (selection.playlistImage) categories.push('playlist_image', 'playlist_image_thumb');

		try {
			clearAtollaNativeCacheCategories(categories);
		} catch {
			// native clear unavailable on non-Android targets
		}

		if (selection.tracks) {
			try {
				clearAtollaTrackCache();
			} catch {
				// native track cache clear unavailable on non-Android targets
			}
			this.viewModel.playbackOrchestrator.resetForTrackCacheCleared();
		}

		if (selection.albumArt) {
			void this.viewModel.paletteService.clearAll();
			try {
				clearAtollaNativeCacheCategories(['album_art_palette']);
			} catch {
				// native clear unavailable on non-Android targets
			}
		}

		if (selection.waveformData) {
			this.viewModel.playbackOrchestrator.clearWaveformData();
		}

		this.refreshNativeCacheStats();
		this.refreshTrackCachedCount();
		closeSlot(this.viewModel.modalSlot);
		this.viewModel.toastService.show(Strings.settingsCacheClearedToast());
	};

	private handleClearCachePress = (): void => {
		const counts = this.state.imageCategoryCounts;

		openSlot(this.viewModel.modalSlot, () => {
			<CacheClearModal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				counts={{
					albumArt: (counts.album_art ?? 0) + (counts.album_art_thumb ?? 0),
					albumArtBlurred: counts.album_art_blurred ?? 0,
					artistImage: (counts.artist_image ?? 0) + (counts.artist_image_thumb ?? 0),
					artistLogo: counts.artist_logo ?? 0,
					genreImage: counts.genre_art ?? 0,
					playlistImage: (counts.playlist_image ?? 0) + (counts.playlist_image_thumb ?? 0),
					tracks: this.state.trackCacheCachedCount,
					waveformData: this.viewModel.playbackOrchestrator.getWaveformReadyCount(),
				}}
				onCancel={this.handleCacheClearCancel}
				onConfirm={this.handleCacheClearConfirm}
			/>;
		});
	};

	private handleClearDebugLogPress = (): void => {
		Logger.clearLog();
		this.viewModel.toastService.show(Strings.settingsDebugLogClearedToast());
	};

	private handleClearDownloadsCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleClearDownloadsConfirm = (): void => {
		this.viewModel.downloadService.removeAllDownloads();
		closeSlot(this.viewModel.modalSlot);
	};

	private handleClearDownloadsPress = (): void => {
		openSlot(this.viewModel.modalSlot, () => {
			<Modal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
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

	private handleDebugLoggingToggle = (enabled: boolean): void => {
		void this.viewModel.preferences.setDebugLoggingEnabled(enabled);
		Logger.setEnabled(enabled);
	};

	private handleDeviceIdInputChange = (value: unknown): void => {
		const normalized = this.normalizeDeviceId(normalizeInputValue(value));
		void this.viewModel.preferences.setJellyfinClientDeviceIdOverride(normalized);
		this.viewModel.sessionController.applyDeviceIdOverride(normalized);
	};

	private handleExportDebugLogPress = (): void => {
		const dest = Logger.exportLog();
		this.setState({ debugExportPath: dest || null });
	};

	private handleGridColumnsSelect = (count: number): void => {
		void this.viewModel.preferences.setGridColumns(count);
	};

	private handleImageCacheSelect = (bytes: number): void => {
		void this.viewModel.preferences.setImageCacheMaxBytes(bytes);
		try {
			setAtollaImageLoaderDiskCacheMaxBytes(bytes);
		} catch {
			// native disk cache unavailable on non-Android targets
		}
	};

	private handleLanguageCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLanguagePress = (): void => {
		const selectedLanguage = this.viewModel.preferences.language ?? DEFAULT_LANGUAGE;
		openSlot(this.viewModel.modalSlot, () => {
			<LanguageSelectModal
				onCancel={this.handleLanguageCancel}
				onSelect={this.handleLanguageSelect}
				selectedLanguage={selectedLanguage}
			/>;
		});
	};

	private handleLanguageSelect = (code: LanguageCode): void => {
		overrideLocales(Strings, () => [new Locale(code, undefined)]);
		void this.viewModel.preferences.setLanguage(code);
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLogoutCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLogoutConfirm = (): void => {
		this.viewModel.sessionController.logout();
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLogoutPress = (): void => {
		openSlot(this.viewModel.modalSlot, () => {
			<Modal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
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

	private handleTrackCacheLimitSelect = (count: number): void => {
		void this.viewModel.preferences.setTrackCacheMaxTracks(count);
		this.applyTrackCacheLimit(count);
		this.refreshTrackCachedCount();
	};

	private normalizeDeviceId(value: string): string {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return '';
		}
		return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
	}

	private refreshNativeCacheStats(): void {
		try {
			// scan walks the whole image disk cache, so it runs on a native background thread and
			// delivers results via this callback, never blocking the JS thread
			requestAtollaImageLoaderDiskCacheStats((diskCount, diskBytes, categoryCountsJson) => {
				if (this.isDestroyed()) return;
				let imageCategoryCounts: Record<string, number> = this.state.imageCategoryCounts;
				try {
					imageCategoryCounts = JSON.parse(categoryCountsJson) as Record<string, number>;
				} catch {
					// leave existing counts on parse failure
				}
				this.setState({
					imageCacheDiskBytes: diskBytes,
					imageCacheDiskCount: diskCount,
					imageCategoryCounts,
				});
			});
		} catch {
			// native cache stats unavailable on non-Android targets
		}
	}

	private refreshTrackCachedCount(): void {
		let count = 0;
		try {
			count = getAtollaTrackCacheEntryCount();
		} catch {
			// native track cache count unavailable on non-Android targets
		}
		this.setState({ trackCacheCachedCount: count });
	}

	private startStatsPolling(): void {
		this.refreshNativeCacheStats();
		this.refreshTrackCachedCount();
		if (this.statsInterval != null) {
			return;
		}
		this.statsInterval = setInterval(() => {
			this.refreshNativeCacheStats();
		}, NATIVE_CACHE_STATS_INTERVAL_MS);
	}

	private stopStatsPolling(): void {
		if (this.statsInterval != null) {
			clearInterval(this.statsInterval);
			this.statsInterval = undefined;
		}
	}
}

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
		marginLeft: 10,
		width: '100%',
	}),
	debugLogPathLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.muted,
		marginLeft: 4,
		marginTop: 8,
	}),
	httpWarningCallout: new Style<View>({
		backgroundColor: withAlpha(theme.colors.warning, 0.12),
		borderRadius: theme.radius.default,
		marginBottom: 12,
		padding: 12,
	}),
	httpWarningCalloutText: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.warning,
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
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(null),
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
