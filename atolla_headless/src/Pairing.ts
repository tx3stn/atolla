import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { type RandomBytes, randomHex } from './Random';

export const CONTROLLERS_KEY = 'controllers';
export const MAX_CONTROLLERS = 32;
export const MEDIA_SERVER_KEY = 'mediaServer';
export const PAIRING_KEY = 'pairing';

const CODE_DIGITS = 8;
const CODE_GROUP = 4;
const CODE_PATTERN = /^\d{8}$/;
// bytes at or above this would make the low digits more likely than the high ones
const DIGIT_CEILING = 250;
const TOKEN_BYTES = 32;

export interface PairedController {
	controllerId: string;
	controllerName: string;
	pairedAt: number;
	token: string;
}

export interface Pairing {
	code: string;
	controllers: Array<PairedController>;
}

export async function addController(
	store: KeyValueStore,
	randomBytes: RandomBytes,
	controller: { controllerId: string; controllerName: string },
): Promise<string> {
	const token = randomHex(randomBytes, TOKEN_BYTES);
	const kept = (await readControllers(store)).filter(
		(held) => held.controllerId !== controller.controllerId,
	);

	kept.push({ ...controller, pairedAt: Date.now(), token });
	kept.sort((left, right) => left.pairedAt - right.pairedAt);

	await store.storeString(CONTROLLERS_KEY, JSON.stringify(kept.slice(-MAX_CONTROLLERS)));

	return token;
}

export function formatCode(code: string): string {
	return `${code.slice(0, CODE_GROUP)} ${code.slice(CODE_GROUP)}`;
}

export async function loadPairing(
	store: KeyValueStore,
	randomBytes: RandomBytes,
): Promise<Pairing> {
	return {
		code: await loadOrCreateCode(store, randomBytes),
		controllers: await readControllers(store),
	};
}

export async function resetPairing(
	store: KeyValueStore,
	randomBytes: RandomBytes,
): Promise<Pairing> {
	const code = generateCode(randomBytes);

	await store.storeString(PAIRING_KEY, code);
	await store.storeString(CONTROLLERS_KEY, JSON.stringify([]));

	return { code, controllers: [] };
}

function generateCode(randomBytes: RandomBytes): string {
	let digits = '';

	while (digits.length < CODE_DIGITS) {
		const [byte] = randomBytes(1);

		if (byte === undefined) {
			throw new Error('entropy source returned no bytes');
		}

		if (byte < DIGIT_CEILING) {
			digits += byte % 10;
		}
	}

	return digits;
}

async function loadOrCreateCode(store: KeyValueStore, randomBytes: RandomBytes): Promise<string> {
	const stored = (await store.fetchString(PAIRING_KEY).catch(() => '')).trim();
	if (CODE_PATTERN.test(stored)) {
		return stored;
	}

	const code = generateCode(randomBytes);
	await store.storeString(PAIRING_KEY, code);

	return code;
}

async function readControllers(store: KeyValueStore): Promise<Array<PairedController>> {
	let value: unknown;
	try {
		value = JSON.parse(await store.fetchString(CONTROLLERS_KEY));
	} catch {
		return [];
	}

	return Array.isArray(value) ? (value as Array<PairedController>) : [];
}
