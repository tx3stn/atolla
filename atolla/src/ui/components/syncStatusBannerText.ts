import type { SyncProgress } from '../../services/ReconnectSyncCoordinator';

// Pure label logic, kept separate from the Valdi component so it can be unit
// tested without the native render harness.
export function syncStatusBannerText(
	progress: Pick<SyncProgress, 'completed' | 'status' | 'total'>,
): string {
	if (progress.status === 'syncing') {
		return `syncing ${progress.total} ${progress.total === 1 ? 'change' : 'changes'}…`;
	}
	if (progress.status === 'partial') {
		return `${progress.completed} of ${progress.total} synced`;
	}
	return 'synced';
}
