import { DEFAULT_BIND_ADDRESS } from './PlayerConfig';

export type LocalAddress = () => string;

export function controlUrl(bindAddress: string, port: number, localAddress: LocalAddress): string {
	if (bindAddress !== DEFAULT_BIND_ADDRESS) {
		return `http://${bindAddress}:${port}`;
	}

	const local = localAddress().trim();

	return `http://${local === '' ? DEFAULT_BIND_ADDRESS : local}:${port}`;
}
