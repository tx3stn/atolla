import { isErrorConst } from 'atolla_core/src/utils/Errors';
import type { HttpResponse, HttpTransport } from 'atolla_sync/src/api/Transport';
import { IntegrationErrors } from '../IntegrationErrors';
import type { LidarrAlbum, LidarrSystemStatus } from './Models';

export class LidarrClient {
	constructor(
		private readonly transport: HttpTransport,
		private readonly baseUrl: string,
		private readonly apiKey: string,
	) {}

	calendar(start: string, end: string): Promise<Array<LidarrAlbum>> {
		return this.getJson<Array<LidarrAlbum>>(
			`/api/v1/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&includeArtist=true`,
		);
	}

	status(): Promise<LidarrSystemStatus> {
		return this.getJson<LidarrSystemStatus>('/api/v1/system/status');
	}

	private async getJson<T>(path: string): Promise<T> {
		let response: HttpResponse;
		try {
			response = await this.transport.get(`${this.baseUrl}${path}`, {
				Accept: 'application/json',
				'X-Api-Key': this.apiKey,
			});
		} catch (error) {
			if (isErrorConst(error)) {
				throw error;
			}
			throw IntegrationErrors.UNREACHABLE.withDetail(String(error));
		}

		if (response.statusCode === 401) {
			throw IntegrationErrors.UNAUTHORIZED;
		}
		if (response.statusCode < 200 || response.statusCode >= 300) {
			throw IntegrationErrors.REQUEST_FAILED.withDetail(String(response.statusCode));
		}

		try {
			return JSON.parse(new TextDecoder().decode(response.body)) as T;
		} catch {
			throw IntegrationErrors.WRONG_SERVICE;
		}
	}
}
