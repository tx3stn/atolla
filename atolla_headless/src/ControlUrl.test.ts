import { describe, expect, it } from 'bun:test';
import { controlUrl } from './ControlUrl';

describe('controlUrl', () => {
	it('uses a specific bind address without asking for the local one', () => {
		let asked = 0;
		const url = controlUrl('192.168.1.42', 45889, () => {
			asked += 1;
			return '10.0.0.1';
		});

		expect(url).toBe('http://192.168.1.42:45889');
		expect(asked).toBe(0);
	});

	it('keeps loopback, which is a deliberate choice rather than a default', () => {
		expect(controlUrl('127.0.0.1', 45992, () => '10.0.0.1')).toBe('http://127.0.0.1:45992');
	});

	it('resolves the local address when bound to every interface', () => {
		expect(controlUrl('0.0.0.0', 45889, () => '192.168.1.42')).toBe('http://192.168.1.42:45889');
	});

	it('falls back to the bind address when there is no route', () => {
		expect(controlUrl('0.0.0.0', 45889, () => '')).toBe('http://0.0.0.0:45889');
	});

	it('treats a blank answer as no route', () => {
		expect(controlUrl('0.0.0.0', 45889, () => '  ')).toBe('http://0.0.0.0:45889');
	});
});
