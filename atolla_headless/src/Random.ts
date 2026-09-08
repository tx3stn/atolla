export type RandomBytes = (count: number) => Uint8Array;

export function randomHex(randomBytes: RandomBytes, count: number): string {
	const bytes = randomBytes(count);

	if (bytes.length !== count) {
		throw new Error(`entropy source returned ${bytes.length} of ${count} bytes`);
	}

	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
