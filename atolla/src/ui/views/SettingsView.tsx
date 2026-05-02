import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
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
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { Button } from '../components/Button';
import { CacheClearModal } from '../components/CacheClearModal';
import { LanguageSelectModal } from '../components/LanguageSelectModal';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Toast';
import { Toggle } from '../components/Toggle';
import { ViewHeader } from '../components/ViewHeader';

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
	defaultJellyfinDeviceId?: string;
	downloadedSizeBytes?: number;
	downloadedTrackCount?: number;
	downloadingCount: number;
	gridColumns?: number;
	imageCacheDiskBytes?: number;
	imageCacheDiskCount?: number;
	imageCacheError?: string | null;
	imageCacheMaxBytes?: number;
	jellyfinDeviceIdOverride?: string;
	onAnimationsChange?: (enabled: boolean) => void;
	onCacheSizeChange?: (bytes: number) => void;
	onClearCache?: (selection: ClearCacheSelection) => void;
	onClearDownloads?: () => void;
	onGridColumnsChange?: (count: number) => void;
	onJellyfinDeviceIdOverrideChange?: (value: string) => void;
	onLanguageChange?: (code: LanguageCode) => void;
	onLogout?: () => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onTrackCacheMaxTracksChange?: (count: number) => void;
	preferences: Preferences;
	selectedLanguage?: LanguageCode;
	trackCacheCachedCount?: number;
	trackCacheMaxTracks?: number;
	waveformCount?: number;
	waveformReadyCount?: number;
}

interface SettingsState {
	showCacheClearModal: boolean;
	showCacheToast: boolean;
	showClearDownloadsModal: boolean;
	showGridColumnsOptions: boolean;
	showImageCacheOptions: boolean;
	showLanguageModal: boolean;
	showLogoutModal: boolean;
	showTrackCacheLimitOptions: boolean;
}

export class SettingsView extends StatefulComponent<SettingsViewModel, SettingsState> {
	state: SettingsState = {
		showCacheClearModal: false,
		showCacheToast: false,
		showClearDownloadsModal: false,
		showGridColumnsOptions: false,
		showImageCacheOptions: false,
		showLanguageModal: false,
		showLogoutModal: false,
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

	private handleLogoutPress = () => {
		this.setState({ showLogoutModal: true });
	};

	private handleLogoutConfirm = () => {
		this.viewModel.onLogout?.();
		this.setState({ showLogoutModal: false });
	};

	private handleLogoutCancel = () => {
		this.setState({ showLogoutModal: false });
	};

	private handleClearDownloadsPress = () => {
		this.setState({ showClearDownloadsModal: true });
	};

	private handleClearDownloadsConfirm = () => {
		this.viewModel.onClearDownloads?.();
		this.setState({ showClearDownloadsModal: false });
	};

	private handleClearDownloadsCancel = () => {
		this.setState({ showClearDownloadsModal: false });
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

	private handleLanguagePress = () => {
		this.setState({ showLanguageModal: true });
	};

	private handleLanguageSelect = (code: LanguageCode) => {
		this.viewModel.onLanguageChange?.(code);
		this.setState({ showLanguageModal: false });
	};

	private handleLanguageCancel = () => {
		this.setState({ showLanguageModal: false });
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
								accessibilityLabel='settings-animations-toggle'
								enabled={animationsEnabled}
								onToggle={(enabled) => onAnimationsChange?.(enabled)}
							/>
						</view>
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsGridColumns()} />
							<view
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
										accessibilityLabel={`settings-grid-columns-option-${option}`}
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

					<label style={styles.sectionTitle} value={Strings.settingsSectionAuth()} />
					<view style={styles.section}>
						<view style={styles.settingRow}>
							<label style={styles.settingLabel} value={Strings.settingsDeviceId()} />
							<view style={styles.authDeviceIdInlineInputContainer}>
								<textfield
									accessibilityLabel='settings-jellyfin-device-id-input'
									autocapitalization='none'
									onChange={(value: unknown) => {
										onJellyfinDeviceIdOverrideChange?.(normalizeInputValue(value));
									}}
									placeholder={defaultJellyfinDeviceId ?? Strings.settingsDeviceIdPlaceholder()}
									style={styles.authDeviceIdInput}
									value={jellyfinDeviceIdOverride ?? ''}
								/>
							</view>
						</view>
						<Button
							accessibilityLabel='settings-logout'
							label={Strings.settingsLogoutButton()}
							onTap={this.handleLogoutPress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionCache()} />
					<view style={styles.section}>
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsImageCacheSize()} />
							<view
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
										accessibilityLabel={`settings-image-cache-size-option-${option}`}
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
								value={Strings.imagesOnDisk(imageCacheDiskCount, formatBytes(imageCacheDiskBytes))}
							/>
						)}
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsPlayQueueCachedTracks()} />
							<view
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
						<label
							accessibilityLabel='settings-track-cache-count'
							style={styles.trackCacheCountLabel}
							value={Strings.tracksCachedCount(trackCacheCachedCount ?? 0)}
						/>
						{this.state.showTrackCacheLimitOptions && (
							<view style={styles.trackCacheLimitOptionsList}>
								{TRACK_CACHE_LIMIT_OPTIONS.map((option) => (
									<view
										accessibilityLabel={`settings-track-cache-limit-option-${option}`}
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
							label={Strings.settingsClearCacheButton()}
							onTap={this.handleClearCachePress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionDownloads()} />
					<view style={styles.section}>
						<label
							accessibilityLabel='settings-downloaded-track-count'
							style={styles.trackCacheCountLabel}
							value={Strings.tracksDownloaded(
								downloadedTrackCount ?? 0,
								formatBytes(downloadedSizeBytes ?? 0),
							)}
						/>
						<Button
							accessibilityLabel='settings-downloads-delete-all'
							label={Strings.settingsDeleteAllDownloadsButton()}
							onTap={this.handleClearDownloadsPress}
						/>
					</view>

					<label style={styles.sectionTitle} value={Strings.settingsSectionLanguage()} />
					<view style={styles.section}>
						<view style={styles.trackCacheLimitContainer}>
							<label style={styles.settingLabel} value={Strings.settingsLanguage()} />
							<view
								accessibilityLabel='settings-language-selector'
								onTap={this.handleLanguagePress}
								style={styles.languageSelectorButton}
							>
								<label
									style={styles.trackCacheLimitButtonLabel}
									value={getLanguageLabel(selectedLanguage)}
								/>
							</view>
						</view>
					</view>

					{this.state.showLanguageModal && (
						<LanguageSelectModal
							onCancel={this.handleLanguageCancel}
							onSelect={this.handleLanguageSelect}
							selectedLanguage={selectedLanguage}
						/>
					)}

					{this.state.showCacheClearModal && (
						<CacheClearModal
							counts={{
								tracks:
									trackCacheCachedCount != null ? { total: trackCacheCachedCount } : undefined,
								waveformData:
									this.viewModel.waveformCount != null
										? {
												ready: this.viewModel.waveformReadyCount,
												total: this.viewModel.waveformCount,
											}
										: undefined,
							}}
							onCancel={this.handleCacheClearCancel}
							onConfirm={this.handleCacheClearConfirm}
						/>
					)}

					{this.state.showClearDownloadsModal && (
						<Modal
							body={Strings.settingsDeleteAllDownloadsConfirm()}
							cancelAccessibilityLabel='settings-downloads-clear-cancel-btn'
							confirmAccessibilityLabel='settings-downloads-clear-confirm-btn'
							modalAccessibilityLabel='settings-downloads-clear-modal'
							onClose={this.handleClearDownloadsCancel}
							onConfirm={this.handleClearDownloadsConfirm}
							title={Strings.settingsDeleteAllDownloadsButton()}
						/>
					)}

					{this.state.showLogoutModal && (
						<Modal
							body={Strings.settingsLogoutConfirm()}
							cancelAccessibilityLabel='settings-logout-cancel-btn'
							confirmAccessibilityLabel='settings-logout-confirm-btn'
							modalAccessibilityLabel='settings-logout-modal'
							onClose={this.handleLogoutCancel}
							onConfirm={this.handleLogoutConfirm}
							title={Strings.settingsLogoutButton()}
						/>
					)}

					{this.state.showCacheToast && <Toast message={Strings.settingsCacheClearedToast()} />}
				</view>
			</scroll>
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
