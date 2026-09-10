import type { ApiVersion, Hello, PairAccepted, PairRequest, Problem } from './generated';
import type { HttpHeaders, HttpResponse, HttpTransport, PendingRequest } from './Transport';

export const REQUEST_CANCELLED = 'request cancelled';

export interface PlayerAnswer<T> {
	headers: HttpHeaders;
	json: T;
	status: number;
}

export class PlayerClient {
	constructor(
		private readonly baseUrl: string,
		private readonly transport: HttpTransport,
		private readonly apiVersion?: ApiVersion,
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	hello(): PendingRequest<PlayerAnswer<Hello | Problem>> {
		return this.settled(this.transport.get(this.url('/hello')));
	}

	pair(body: PairRequest): PendingRequest<PlayerAnswer<PairAccepted | Problem>> {
		const headers: HttpHeaders = { 'Content-Type': 'application/json' };
		if (this.apiVersion !== undefined) {
			headers['Atolla-API-Version'] = String(this.apiVersion);
		}

		const bytes = new TextEncoder().encode(JSON.stringify(body));

		return this.settled(this.transport.post(this.url('/pair'), bytes, headers));
	}

	private settled<T>(request: PendingRequest<HttpResponse>): PendingRequest<PlayerAnswer<T>> {
		let cancel = (): void => {};

		const cancelled = new Promise<never>((_resolve, reject) => {
			cancel = () => {
				request.cancel?.();
				reject(new Error(REQUEST_CANCELLED));
			};
		});

		const answered = Promise.resolve(request).then((response) => ({
			headers: response.headers,
			json: JSON.parse(new TextDecoder().decode(response.body)) as T,
			status: response.statusCode,
		}));

		const raced = Promise.race([answered, cancelled]);
		raced.catch(() => {});

		return Object.assign(raced, { cancel });
	}

	private url(path: string): string {
		return `${this.baseUrl}${path}`;
	}
}
