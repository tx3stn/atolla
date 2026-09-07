export type RandomBytes = (count: number) => Uint8Array;

export function randomHex(randomBytes: RandomBytes, count: number): string {
	return Array.from(randomBytes(count), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
