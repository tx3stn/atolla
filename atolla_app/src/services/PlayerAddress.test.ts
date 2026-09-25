import { describe, expect, it } from 'bun:test';
import { normalizeAddress } from './PlayerAddress';

describe('normalizeAddress', () => {
	it('keeps a port that was typed', () => {
		expect(normalizeAddress('192.168.1.42:45990')).toBe('http://192.168.1.42:45990');
	});

	it('accepts a host name', () => {
		expect(normalizeAddress('laptop.local:45889')).toBe('http://laptop.local:45889');
	});

	it('accepts an address that already carries its scheme', () => {
		expect(normalizeAddress('http://192.168.1.42:45990')).toBe('http://192.168.1.42:45990');
	});

	it('ignores surrounding whitespace', () => {
		expect(normalizeAddress('  192.168.1.42:45889  ')).toBe('http://192.168.1.42:45889');
	});

	it('drops a trailing slash', () => {
		expect(normalizeAddress('192.168.1.42:45990/')).toBe('http://192.168.1.42:45990');
	});

	it.each([
		['', 'nothing typed'],
		['192.168.1.42', 'a host with no port, which the daemon prints for you'],
		['   ', 'only whitespace'],
		['http://', 'a scheme and no host'],
		[':45889', 'a port and no host'],
		['192.168.1.42:', 'a colon and no port'],
		['192.168.1.42:0', 'port zero'],
		['192.168.1.42:65536', 'a port past the top of the range'],
		['192.168.1.42:http', 'a port that is not a number'],
		['192.168.1.42:45889:1', 'two ports'],
		['https://192.168.1.42', 'a scheme the daemon does not serve'],
		['192.168.1 .42', 'an embedded space'],
	])('refuses %p, which is %s', (input) => {
		expect(normalizeAddress(input)).toBeNull();
	});
});
