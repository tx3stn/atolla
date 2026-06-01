import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { SyncStatus } from '../../services/ReconnectSyncCoordinator';
import { theme, topInset } from '../../theme';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';
import { syncStatusBannerText } from './syncStatusBannerText';

export interface SyncStatusBannerViewModel {
	completed: number;
	// Invoked when a partial-sync banner is tapped (e.g. to show failure detail).
	onTap?: () => void;
	status: SyncStatus;
	total: number;
}

// A small pill anchored just below the header's connectivity toggle that shows
// the progress of work flushed when reconnecting (playlist edits, scrobbles).
// Styling comes entirely from the theme.
export class SyncStatusBanner extends Component<SyncStatusBannerViewModel> {
	private handleTap = (): void => {
		this.viewModel.onTap?.();
	};

	onRender(): void {
		const { status } = this.viewModel;
		const isSyncing = status === 'syncing';
		const isPartial = status === 'partial';
		const text = syncStatusBannerText(this.viewModel);

		<view
			accessibilityId='sync-status-banner'
			accessibilityLabel='sync-status-banner'
			onTap={isPartial ? this.handleTap : undefined}
			style={styles.container}
		>
			{isSyncing && (
				<view style={styles.spinnerWrap}>
					<LoopingArrowSpinner accessibilityId='sync-status-spinner' size={16} />
				</view>
			)}
			<label numberOfLines={2} style={styles.message} value={text} />
		</view>;
	}
}

const styles = {
	container: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.toastGlassBg,
		borderRadius: theme.radius.pill,
		boxShadow: theme.shadow.raised,
		flexDirection: 'row',
		left: 12,
		maxWidth: '80%',
		padding: 10,
		paddingLeft: 14,
		paddingRight: 14,
		position: 'absolute',
		top: topInset + theme.headerHeight,
		zIndex: 150,
	}),
	message: new Style<Label>({
		...theme.text.mainBold,
	}),
	spinnerWrap: new Style<View>({
		marginRight: 8,
	}),
};
