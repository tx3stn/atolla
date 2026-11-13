import type { CacheWindow } from 'atolla_sync/src/api/generated';

export function putCacheWindow(
	baseUrl: string,
	token: string,
	window: CacheWindow,
): Promise<Response> {
	return fetch(`${baseUrl}/media`, {
		body: JSON.stringify(window),
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		method: 'PUT',
	});
}

export function putMedia(
	baseUrl: string,
	token: string,
	trackId: string,
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Response> {
	return fetch(`${baseUrl}/media/${trackId}`, {
		body: bytes,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
		method: 'PUT',
	});
}
