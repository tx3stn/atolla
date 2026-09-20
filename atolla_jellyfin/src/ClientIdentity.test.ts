import { describe, expect, it } from 'bun:test';
import { version } from 'atolla_core/src/version';
import {
	CLIENT_APP,
	CLIENT_HEADLESS,
	createClientHeader,
	normalizeDeviceId,
	normalizeDeviceName,
} from './ClientIdentity';

const identity = { client: CLIENT_APP, deviceId: 'atolla-9f3a1c', deviceName: 'Pixel 9 Pro' };

describe('createClientHeader', () => {
	it('renders every field the server identifies a client by', () => {
		expect(createClientHeader(identity, 'token-1')).toBe(
			`MediaBrowser Client="atolla", Device="Pixel 9 Pro", DeviceId="atolla-9f3a1c", Version="${version}", Token="token-1"`,
		);
	});

	it('omits the token when none is given', () => {
		expect(createClientHeader(identity)).toBe(
			`MediaBrowser Client="atolla", Device="Pixel 9 Pro", DeviceId="atolla-9f3a1c", Version="${version}"`,
		);
	});

	it('omits the token for an empty string, which is what signed out passes', () => {
		expect(createClientHeader(identity, '')).not.toContain('Token=');
	});

	// The speaker and the phone are separate entries in the server's device list, so revoking one
	// leaves the other playing.
	it('names the client it was told to, so the daemon is not mistaken for the app', () => {
		const header = createClientHeader({ ...identity, client: CLIENT_HEADLESS }, 'token-1');

		expect(header).toContain('Client="atolla-headless"');
		expect(createClientHeader(identity, 'token-1')).toContain('Client="atolla"');
	});

	it('normalises the id it is handed so a caller cannot emit a malformed one', () => {
		const header = createClientHeader({ ...identity, deviceId: 'bad id!' });
		expect(header).toContain('DeviceId="bad_id_"');
	});

	it('normalises the name it is handed so a caller cannot break the quoting', () => {
		const header = createClientHeader({ ...identity, deviceName: 'a"b' });
		expect(header).toContain('Device="ab"');
	});

	it('cannot be made to inject a second header', () => {
		const header = createClientHeader({
			...identity,
			deviceName: 'Pixel 9\r\nX-Evil: 1',
		});
		expect(header).not.toContain('\r');
		expect(header).not.toContain('\n');
	});
});

describe('normalizeDeviceId', () => {
	it('keeps an id that is already in the charset', () => {
		expect(normalizeDeviceId('atolla-9f3a1c.0_1')).toBe('atolla-9f3a1c.0_1');
	});

	it('replaces characters outside the charset', () => {
		expect(normalizeDeviceId('iPad Pro!')).toBe('iPad_Pro_');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeDeviceId('  atolla-9f3a1c  ')).toBe('atolla-9f3a1c');
	});

	it('falls back for an empty, blank or absent value', () => {
		expect(normalizeDeviceId('')).toBe('atolla');
		expect(normalizeDeviceId('   ')).toBe('atolla');
		expect(normalizeDeviceId(undefined)).toBe('atolla');
		expect(normalizeDeviceId(null)).toBe('atolla');
	});
});

describe('normalizeDeviceName', () => {
	it('keeps the spaces the device id charset would have replaced', () => {
		expect(normalizeDeviceName('Pixel 9 Pro')).toBe('Pixel 9 Pro');
	});

	it('strips the characters that would break the quoted form', () => {
		expect(normalizeDeviceName('a"b\\c,d')).toBe('abcd');
	});

	it('strips control characters', () => {
		expect(normalizeDeviceName('Pixel 9\r\nPro')).toBe('Pixel 9Pro');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeDeviceName('  Pixel 9 Pro  ')).toBe('Pixel 9 Pro');
	});

	it('caps the length so a pasted essay cannot become a header', () => {
		expect(normalizeDeviceName('x'.repeat(200))).toHaveLength(64);
	});

	it('falls back for an empty, blank or absent value', () => {
		expect(normalizeDeviceName('')).toBe('atolla');
		expect(normalizeDeviceName('   ')).toBe('atolla');
		expect(normalizeDeviceName(undefined)).toBe('atolla');
		expect(normalizeDeviceName(null)).toBe('atolla');
	});

	it('falls back when stripping leaves nothing behind', () => {
		expect(normalizeDeviceName('","')).toBe('atolla');
	});
});
