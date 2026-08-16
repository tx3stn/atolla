import type { DevTools } from 'atolla_app/src/dev/DevTools';
import type { SlotRenderer } from 'atolla_app/src/ui/flows/ModalSlotFlow';
import { DevAnimationGalleryView } from './DevAnimationGalleryView';
import { DevGalleryView } from './DevGalleryView';

// The concrete dev tooling handed to the shared App by AppDev. Building the gallery renderers here
// keeps the gallery views out of the released closure entirely — release code only ever names the
// DevTools interface, never this module.
export const devTools: DevTools = {
	animationGalleryRenderer:
		(onClose: () => void): SlotRenderer =>
		(): void => {
			<DevAnimationGalleryView onClose={onClose} />;
		},
	toastGalleryRenderer:
		(onClose: () => void): SlotRenderer =>
		(): void => {
			<DevGalleryView onClose={onClose} />;
		},
};
