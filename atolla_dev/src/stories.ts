import type { AppServicesBag } from 'atolla/src/services/AppServices';
import { ToastTypes } from 'atolla/src/services/ToastService';

// The dev toast gallery's fixtures. Labels and messages are deliberately plain literals, not
// localized Strings: this is dev-only test data that never ships, so there is nothing to translate.
export interface ToastStory {
	accessibilityId: string;
	label: string;
	run: (services: AppServicesBag) => void;
}

export const toastStories: Array<ToastStory> = [
	{
		accessibilityId: 'dev-story-success',
		label: 'success',
		run: (services) =>
			services.toastService.show({ message: 'added to queue', variant: ToastTypes.success }),
	},
	{
		accessibilityId: 'dev-story-error',
		label: 'error',
		run: (services) =>
			services.toastService.show({ message: "couldn't add to queue", variant: ToastTypes.error }),
	},
	{
		accessibilityId: 'dev-story-progress',
		label: 'progress (persistent)',
		run: (services) =>
			services.toastService.showPersistent({
				message: 'syncing 3 changes…',
				variant: ToastTypes.progress,
			}),
	},
	{
		accessibilityId: 'dev-story-info',
		label: 'info',
		run: (services) =>
			services.toastService.show({ message: 'nothing to sync', variant: ToastTypes.info }),
	},
	{
		accessibilityId: 'dev-story-long',
		label: 'long / two-line',
		run: (services) =>
			services.toastService.show({
				message: 'this is a much longer message that wraps onto a second line to check truncation',
				variant: ToastTypes.success,
			}),
	},
	{
		accessibilityId: 'dev-story-tappable',
		label: 'tappable (partial sync)',
		run: (services) =>
			services.toastService.show(
				{
					message: '2 of 3 synced — tap for details',
					onTap: () => services.toastService.show({ message: 'tapped!', variant: ToastTypes.info }),
					variant: ToastTypes.error,
				},
				6000,
			),
	},
];
