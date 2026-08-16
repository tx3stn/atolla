import type { SlotRenderer } from '../ui/flows/ModalSlotFlow';

// Dev-only tooling injected by the dev app root (//atolla_app_dev's AppDev). The released //:atolla build
// passes nothing, so every dev surface is both unreachable and absent from its dependency closure —
// the concrete implementation lives in the //atolla_app_dev module, which release never compiles.
// Shared code carries only this interface and the DevToolsSection rendering against it; without an
// implementation that section renders nothing, and neither names a gallery view.
export interface DevTools {
	// builds the renderer for the dev animation gallery, to be slotted into the settings modal slot.
	// onClose closes that slot.
	animationGalleryRenderer: (onClose: () => void) => SlotRenderer;
	// builds the renderer for the dev toast gallery, to be slotted into the settings modal slot.
	// onClose closes that slot.
	toastGalleryRenderer: (onClose: () => void) => SlotRenderer;
}
