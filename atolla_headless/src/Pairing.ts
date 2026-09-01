import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { RandomBytes } from './Random';

export const PAIRING_KEY = 'pairing';

const CODE_DIGITS = 8;
const CODE_GROUP = 4;
const CODE_PATTERN = /^\d{8}$/;
// bytes at or above this would make the low digits more likely than the high ones
const DIGIT_CEILING = 250;

export interface PairedController {
	id: string;
	name: string;
}

export interface Pairing {
	code: string;
	controllers: Array<PairedController>;
}

export function formatCode(code: string): string {
	return `${code.slice(0, CODE_GROUP)} ${code.slice(CODE_GROUP)}`;
}

export async function loadPairing(
	store: KeyValueStore,
	randomBytes: RandomBytes,
): Promise<Pairing> {
	const stored = parse(await store.fetchString(PAIRING_KEY).catch(() => ''));

	return stored ?? persist(store, { code: generateCode(randomBytes), controllers: [] });
}

export async function resetPairing(
	store: KeyValueStore,
	randomBytes: RandomBytes,
): Promise<Pairing> {
	return persist(store, { code: generateCode(randomBytes), controllers: [] });
}

export function verifyCode(pairing: Pairing, candidate: string): boolean {
	return candidate.replace(/\s/g, '') === pairing.code;
}

function generateCode(randomBytes: RandomBytes): string {
	let digits = '';

	while (digits.length < CODE_DIGITS) {
		const [byte] = randomBytes(1);
		if (byte < DIGIT_CEILING) {
			digits += byte % 10;
		}
	}

	return digits;
}

function parse(raw: string): Pairing | undefined {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}

	const stored = value as { code?: unknown; controllers?: unknown };
	if (typeof stored.code !== 'string' || !CODE_PATTERN.test(stored.code)) {
		return undefined;
	}

	return {
		code: stored.code,
		controllers: Array.isArray(stored.controllers)
			? (stored.controllers as Array<PairedController>)
			: [],
	};
}

async function persist(store: KeyValueStore, pairing: Pairing): Promise<Pairing> {
	await store.storeString(PAIRING_KEY, JSON.stringify(pairing));

	return pairing;
}
