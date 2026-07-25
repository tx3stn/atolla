import type { DevTools } from 'atolla/src/dev/DevTools';
import type { SlotRenderer } from 'atolla/src/ui/flows/ModalSlotFlow';
import { DevGalleryView } from './DevGalleryView';

// The concrete dev tooling handed to the shared App by AppDev. Building the gallery renderer here
// keeps DevGalleryView out of the released closure entirely — release code only ever names the
// DevTools interface, never this module.
export const devTools: DevTools = {
	galleryRenderer:
		(onClose: () => void): SlotRenderer =>
		(): void => {
			<DevGalleryView onClose={onClose} />;
		},
};
