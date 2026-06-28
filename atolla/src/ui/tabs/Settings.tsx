import { Component } from 'valdi_core/src/Component';
import { SettingsView, type SettingsViewModel } from '../views/SettingsView';

export interface SettingsTabViewModel {
	settings: SettingsViewModel;
}

export class SettingsTab extends Component<SettingsTabViewModel> {
	onRender(): void {
		const settings = this.viewModel.settings;

		<SettingsView
			animationsEnabled={settings.animationsEnabled}
			connectionMode={settings.connectionMode}
			debugExportPath={settings.debugExportPath}
			debugLogFilePath={settings.debugLogFilePath}
			debugLoggingEnabled={settings.debugLoggingEnabled}
			defaultJellyfinDeviceId={settings.defaultJellyfinDeviceId}
			downloadedSizeBytes={settings.downloadedSizeBytes}
			downloadedTrackCount={settings.downloadedTrackCount}
			downloadingCount={settings.downloadingCount}
			gridColumns={settings.gridColumns}
			imageCacheDiskBytes={settings.imageCacheDiskBytes}
			imageCacheDiskCount={settings.imageCacheDiskCount}
			imageCacheError={settings.imageCacheError}
			imageCacheMaxBytes={settings.imageCacheMaxBytes}
			imageCategoryAlbumArtBlurredCount={settings.imageCategoryAlbumArtBlurredCount}
			imageCategoryAlbumArtCount={settings.imageCategoryAlbumArtCount}
			imageCategoryArtistImageCount={settings.imageCategoryArtistImageCount}
			imageCategoryArtistLogoCount={settings.imageCategoryArtistLogoCount}
			imageCategoryGenreImageCount={settings.imageCategoryGenreImageCount}
			imageCategoryPlaylistImageCount={settings.imageCategoryPlaylistImageCount}
			jellyfinDeviceIdOverride={settings.jellyfinDeviceIdOverride}
			modalSlot={settings.modalSlot}
			offlineStatusExportPath={settings.offlineStatusExportPath}
			onAnimationsChange={settings.onAnimationsChange}
			onCacheSizeChange={settings.onCacheSizeChange}
			onClearCache={settings.onClearCache}
			onClearDebugLog={settings.onClearDebugLog}
			onClearDownloads={settings.onClearDownloads}
			onDebugLoggingChange={settings.onDebugLoggingChange}
			onExportDebugLog={settings.onExportDebugLog}
			onExportOfflineStatus={settings.onExportOfflineStatus}
			onGridColumnsChange={settings.onGridColumnsChange}
			onJellyfinDeviceIdOverrideChange={settings.onJellyfinDeviceIdOverrideChange}
			onLanguageChange={settings.onLanguageChange}
			onLogout={settings.onLogout}
			onRequestModeChange={settings.onRequestModeChange}
			onTrackCacheMaxTracksChange={settings.onTrackCacheMaxTracksChange}
			preferences={settings.preferences}
			selectedLanguage={settings.selectedLanguage}
			serverName={settings.serverName}
			serverUrl={settings.serverUrl}
			toastService={settings.toastService}
			trackCacheCachedCount={settings.trackCacheCachedCount}
			trackCacheMaxTracks={settings.trackCacheMaxTracks}
			waveformReadyCount={settings.waveformReadyCount}
		/>;
	}
}
