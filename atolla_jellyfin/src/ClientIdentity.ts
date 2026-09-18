import { version } from 'atolla_core/src/version';

const CLIENT_NAME = 'atolla';
const MAX_DEVICE_NAME_LENGTH = 64;
const QUOTING_CHARACTERS = /["\\,]/g;
const DEVICE_ID_CHARACTERS = /[^a-zA-Z0-9._-]/g;

export interface ClientIdentity {
	deviceId: string;
	deviceName: string;
}

export function createClientHeader(identity: ClientIdentity, accessToken?: string): string {
	const base = `MediaBrowser Client="${CLIENT_NAME}", Device="${normalizeDeviceName(identity.deviceName)}", DeviceId="${normalizeDeviceId(identity.deviceId)}", Version="${version}"`;

	if (!accessToken) {
		return base;
	}

	return `${base}, Token="${accessToken}"`;
}

export function normalizeDeviceId(value: string | null | undefined): string {
	if (typeof value !== 'string') {
		return CLIENT_NAME;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return CLIENT_NAME;
	}

	return trimmed.replace(DEVICE_ID_CHARACTERS, '_');
}

export function normalizeDeviceName(value: string | null | undefined): string {
	if (typeof value !== 'string') {
		return CLIENT_NAME;
	}

	const printable = [...value]
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code >= 0x20 && code !== 0x7f;
		})
		.join('');
	const stripped = printable.replace(QUOTING_CHARACTERS, '').trim();
	if (stripped.length === 0) {
		return CLIENT_NAME;
	}

	return stripped.slice(0, MAX_DEVICE_NAME_LENGTH);
}
