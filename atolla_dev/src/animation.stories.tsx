import res from 'atolla/res';
import { DownloadedTick } from 'atolla/src/ui/animations/DownloadedTick';
import { LoadingSpinner } from 'atolla/src/ui/animations/LoadingSpinner';
import { LogoWifiOn } from 'atolla/src/ui/animations/LogoWifiOn';
import { ContextMenuActionRow } from 'atolla/src/ui/components/ContextMenuActionRow';
import { TappableIcon } from 'atolla/src/ui/components/TappableIcon';
import { DevDownloadSequence } from './DevDownloadSequence';

// The dev animation gallery's stories. Every one mounts the production component rather than a
// stand-in, so what the stage shows is what the app does. Labels are deliberately plain literals,
// not localized Strings: this is dev-only test data that never ships.
//
// sizeable marks the stories the stage's size buttons apply to. Both ripples run at their production
// hit size because the ripple expands to 1.55x that, which would paint outside the stage at anything
// larger.
export interface AnimationStory {
	accessibilityId: string;
	label: string;
	render: (animationsEnabled: boolean, size: number) => unknown;
	sizeable: boolean;
}

const noop = (): void => {};

export const animationStories: Array<AnimationStory> = [
	{
		accessibilityId: 'dev-animation-spinner',
		label: 'spinner',
		render: (_animationsEnabled, size) => <LoadingSpinner size={size} />,
		sizeable: true,
	},
	{
		accessibilityId: 'dev-animation-tick',
		label: 'downloaded tick',
		render: (_animationsEnabled, size) => <DownloadedTick onComplete={noop} size={size} />,
		sizeable: true,
	},
	{
		accessibilityId: 'dev-animation-logo-wifi',
		label: 'logo wifi on',
		render: (_animationsEnabled, size) => <LogoWifiOn size={size} />,
		sizeable: true,
	},
	{
		accessibilityId: 'dev-animation-download-sequence',
		label: 'download sequence',
		render: (animationsEnabled) => <DevDownloadSequence animationsEnabled={animationsEnabled} />,
		sizeable: false,
	},
	{
		accessibilityId: 'dev-animation-icon-ripple',
		label: 'icon ripple (tap it)',
		render: (animationsEnabled) => (
			<TappableIcon animationsEnabled={animationsEnabled} icon={res.play} onTap={noop} />
		),
		sizeable: false,
	},
	{
		accessibilityId: 'dev-animation-row-ripple',
		label: 'row ripple (tap it)',
		render: (animationsEnabled) => (
			<ContextMenuActionRow
				accessibilityId='dev-animation-row-ripple-row'
				animationsEnabled={animationsEnabled}
				icon={res.addtoqueue}
				label='tap to ripple'
				onPress={noop}
			/>
		),
		sizeable: false,
	},
];
