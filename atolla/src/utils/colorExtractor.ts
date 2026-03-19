// @ts-nocheck
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { parseJpegColor } from './jpegColorParser';

type Unsubscribe = () => void;

export function extractAccentColor(imageUrl: string, onColor: (hex: string) => void): Unsubscribe {
	const sub = addAssetLoadObserver(
		imageUrl,
		(data, error) => {
			if (error || !(data instanceof Uint8Array)) return;
			try {
				const hex = parseJpegColor(data);
				if (hex) onColor(hex);
			} catch {
				// ignore parse failures
			}
		},
		AssetOutputType.BYTES,
	);
	return () => sub.unsubscribe();
}
