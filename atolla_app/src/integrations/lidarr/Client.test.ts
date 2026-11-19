import { describe, expect, it } from 'bun:test';
import type { HttpHeaders, HttpResponse, HttpTransport } from 'atolla_sync/src/api/Transport';
import { IntegrationErrors } from '../IntegrationErrors';
import { LidarrClient } from './Client';

interface Call {
	headers?: HttpHeaders;
	url: string;
}

function answering(statusCode: number, body: string) {
	const calls: Array<Call> = [];
	const response: HttpResponse = {
		body: new TextEncoder().encode(body),
		headers: {},
		statusCode,
	};
	const transport: HttpTransport = {
		get: (url, headers) => {
			calls.push({ headers, url });
			return Promise.resolve(response);
		},
		post: () => Promise.reject(new Error('unused')),
		put: () => Promise.reject(new Error('unused')),
	};

	return { calls, transport };
}

function failing(error: unknown): HttpTransport {
	return {
		get: () => Promise.reject(error),
		post: () => Promise.reject(error),
		put: () => Promise.reject(error),
	};
}

describe('LidarrClient', () => {
	describe('status', () => {
		it('asks the server for its status with the api key', async () => {
			const { calls, transport } = answering(200, '{"appName":"Lidarr"}');

			await new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1').status();

			expect(calls).toEqual([
				{
					headers: { Accept: 'application/json', 'X-Api-Key': 'key-1' },
					url: 'http://lidarr.local:8686/api/v1/system/status',
				},
			]);
		});

		it('answers with the status the server sent', async () => {
			const { transport } = answering(200, '{"appName":"Lidarr","version":"2.9.6"}');

			const status = await new LidarrClient(
				transport,
				'http://lidarr.local:8686',
				'key-1',
			).status();

			expect(status.appName).toBe('Lidarr');
		});

		it('says the key was refused on a 401', async () => {
			const { transport } = answering(401, '');

			await expect(
				new LidarrClient(transport, 'http://lidarr.local:8686', 'wrong').status(),
			).rejects.toBe(IntegrationErrors.UNAUTHORIZED);
		});

		it('says the request failed on any other error status', async () => {
			const { transport } = answering(500, '');

			await expect(
				new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1').status(),
			).rejects.toEqual(IntegrationErrors.REQUEST_FAILED.withDetail('500'));
		});

		it('says it is the wrong service when the answer is not json', async () => {
			const { transport } = answering(200, '<html>router login</html>');

			await expect(
				new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1').status(),
			).rejects.toBe(IntegrationErrors.WRONG_SERVICE);
		});

		it('says the server is unreachable when the request fails', async () => {
			const transport = failing(new Error('connection refused'));

			await expect(
				new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1').status(),
			).rejects.toEqual(IntegrationErrors.UNREACHABLE.withDetail('Error: connection refused'));
		});

		it('passes a timeout through as it arrives', async () => {
			const transport = failing(IntegrationErrors.TIMED_OUT);

			await expect(
				new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1').status(),
			).rejects.toBe(IntegrationErrors.TIMED_OUT);
		});
	});
});
