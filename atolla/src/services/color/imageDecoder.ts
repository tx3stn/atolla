import { decodeJpeg } from './jpegDecoder';
import { decodePng } from './pngDecoder';

// Returns a flat RGBA Uint8Array for the given image buffer.
// PNG: full pixel decode. JPEG: one sample per 8×8 MCU block (baseline only).
// Falls back to canvas decoding for progressive JPEG, WebP, and other formats
// supported by the runtime. Returns null if all approaches fail.
export function decodePixelSamples(
	buffer: ArrayBuffer,
	mimeType: string,
): Promise<Uint8Array | null> {
	const type = mimeType.toLowerCase().split(';')[0].trim();
	try {
		if (type === 'image/png') return Promise.resolve(decodePng(buffer));
		if (type === 'image/jpeg' || type === 'image/jpg') return Promise.resolve(decodeJpeg(buffer));
	} catch {
		return Promise.resolve(null);
	}
	return decodeViaCanvas(buffer, mimeType);
}

async function decodeViaCanvas(buffer: ArrayBuffer, mimeType: string): Promise<Uint8Array | null> {
	try {
		const blob = new Blob([buffer], { type: mimeType });
		const bitmap = await createImageBitmap(blob);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0);
		const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
		return new Uint8Array(imageData.data.buffer);
	} catch {
		return null;
	}
}
