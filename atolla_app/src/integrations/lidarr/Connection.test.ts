import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { HttpResponse, HttpTransport } from 'atolla_sync/src/api/Transport';
import { IntegrationErrors } from '../IntegrationErrors';
import { LidarrClient } from './Client';
import { LidarrConnection } from './Connection';

function server(statusCode: number, body: string) {
	const urls: Array<string> = [];
	const keys: Array<string | undefined> = [];
	const response: HttpResponse = {
		body: new TextEncoder().encode(body),
		headers: {},
		statusCode,
	};
	const transport: HttpTransport = {
		get: (url, headers) => {
			urls.push(url);
			keys.push(headers?.['X-Api-Key']);
			return Promise.resolve(response);
		},
		post: () => Promise.reject(new Error('unused')),
		put: () => Promise.reject(new Error('unused')),
	};

	return { keys, transport, urls };
}

function connection(transport: HttpTransport, store = new InMemoryKeyValueStore()) {
	return new LidarrConnection({
		createClient: (url, apiKey) => new LidarrClient(transport, url, apiKey),
		store,
	});
}

const lidarr = '{"appName":"Lidarr"}';

describe('LidarrConnection', () => {
	describe('connect', () => {
		it('is connected once the server says it is lidarr', async () => {
			const { transport } = server(200, lidarr);
			const lidarrConnection = connection(transport);

			await lidarrConnection.connect('http://lidarr.local:8686', 'key-1');

			expect(lidarrConnection.connected()).toEqual({
				apiKey: 'key-1',
				url: 'http://lidarr.local:8686',
			});
		});

		it('adds https and drops a trailing slash from the address', async () => {
			const { transport, urls } = server(200, lidarr);
			const lidarrConnection = connection(transport);

			await lidarrConnection.connect(' lidarr.local:8686/ ', 'key-1');

			expect(urls).toEqual(['https://lidarr.local:8686/api/v1/system/status']);
			expect(lidarrConnection.connected()?.url).toBe('https://lidarr.local:8686');
		});

		it('trims the api key', async () => {
			const { keys, transport } = server(200, lidarr);
			const lidarrConnection = connection(transport);

			await lidarrConnection.connect('http://lidarr.local:8686', ' key-1 \n');

			expect(keys).toEqual(['key-1']);
			expect(lidarrConnection.connected()?.apiKey).toBe('key-1');
		});

		it('refuses a server that is not lidarr', async () => {
			const { transport } = server(200, '{"appName":"Sonarr"}');
			const lidarrConnection = connection(transport);

			await expect(lidarrConnection.connect('http://sonarr.local:8989', 'key-1')).rejects.toBe(
				IntegrationErrors.WRONG_SERVICE,
			);
			expect(lidarrConnection.connected()).toBeNull();
		});

		it('keeps nothing when the key is refused', async () => {
			const { transport } = server(401, '');
			const store = new InMemoryKeyValueStore();
			const lidarrConnection = connection(transport, store);

			await expect(lidarrConnection.connect('http://lidarr.local:8686', 'wrong')).rejects.toBe(
				IntegrationErrors.UNAUTHORIZED,
			);
			expect(lidarrConnection.connected()).toBeNull();
			expect(await store.exists('connection')).toBe(false);
		});

		it('tells its listeners', async () => {
			const { transport } = server(200, lidarr);
			const lidarrConnection = connection(transport);
			let heard = 0;
			lidarrConnection.subscribe(() => {
				heard += 1;
			});

			await lidarrConnection.connect('http://lidarr.local:8686', 'key-1');

			expect(heard).toBe(1);
		});
	});

	describe('disconnect', () => {
		it('forgets the api key and keeps the address', async () => {
			const { transport } = server(200, lidarr);
			const lidarrConnection = connection(transport);
			await lidarrConnection.connect('http://lidarr.local:8686', 'key-1');

			await lidarrConnection.disconnect();

			expect(lidarrConnection.connected()).toBeNull();
			expect(lidarrConnection.savedUrl()).toBe('http://lidarr.local:8686');
		});

		it('tells its listeners', async () => {
			const { transport } = server(200, lidarr);
			const lidarrConnection = connection(transport);
			await lidarrConnection.connect('http://lidarr.local:8686', 'key-1');
			let heard = 0;
			lidarrConnection.subscribe(() => {
				heard += 1;
			});

			await lidarrConnection.disconnect();

			expect(heard).toBe(1);
		});
	});

	describe('load', () => {
		it('restores a saved connection', async () => {
			const { transport } = server(200, lidarr);
			const store = new InMemoryKeyValueStore();
			await connection(transport, store).connect('http://lidarr.local:8686', 'key-1');
			const restored = connection(transport, store);

			await restored.load();

			expect(restored.connected()).toEqual({ apiKey: 'key-1', url: 'http://lidarr.local:8686' });
		});

		it('restores the address without the key after a disconnect', async () => {
			const { transport } = server(200, lidarr);
			const store = new InMemoryKeyValueStore();
			const first = connection(transport, store);
			await first.connect('http://lidarr.local:8686', 'key-1');
			await first.disconnect();
			const restored = connection(transport, store);

			await restored.load();

			expect(restored.connected()).toBeNull();
			expect(restored.savedUrl()).toBe('http://lidarr.local:8686');
		});

		it('is not connected when nothing was saved', async () => {
			const { transport } = server(200, lidarr);
			const lidarrConnection = connection(transport);

			await lidarrConnection.load();

			expect(lidarrConnection.connected()).toBeNull();
			expect(lidarrConnection.savedUrl()).toBe('');
		});
	});
});
