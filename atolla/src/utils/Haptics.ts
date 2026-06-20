import {
	DeviceHapticFeedbackType,
	performHapticFeedback as nativeBridgeHaptic,
} from 'valdi_core/src/DeviceBridge';

export function hapticFeedback(): void {
	try {
		nativeBridgeHaptic(DeviceHapticFeedbackType?.SELECTION ?? 'selection');
	} catch {}
}
