const SCHEME = 'http://';
const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;
const MAX_PORT = 65535;

export function normalizeAddress(input: string): string | null {
	const trimmed = input.trim().replace(/\/+$/, '');
	if (!trimmed.startsWith(SCHEME) && trimmed.includes('://')) {
		return null;
	}

	const authority = trimmed.startsWith(SCHEME) ? trimmed.slice(SCHEME.length) : trimmed;
	const [host, port, ...rest] = authority.split(':');
	if (host === undefined || !HOST_PATTERN.test(host) || rest.length > 0) {
		return null;
	}

	if (port === undefined || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > MAX_PORT) {
		return null;
	}

	return `${SCHEME}${host}:${Number(port)}`;
}
