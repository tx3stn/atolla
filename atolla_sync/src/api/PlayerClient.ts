import type {
	ApiVersion,
	Command,
	CommandAccepted,
	Hello,
	MediaServer,
	MediaServerAccepted,
	PairAccepted,
	PairRequest,
	Problem,
	StateSnapshot,
} from './generated';
import type { HttpHeaders, HttpResponse, HttpTransport, PendingRequest } from './Transport';

export const REQUEST_CANCELLED = 'request cancelled';

function decode(body?: Uint8Array): unknown {
	if (body === undefined || body.length === 0) {
		return undefined;
	}

	return JSON.parse(new TextDecoder().decode(body));
}

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

	command(token: string, body: Command): PendingRequest<PlayerAnswer<CommandAccepted | Problem>> {
		const headers = this.headers(token);
		headers['Content-Type'] = 'application/json';

		const bytes = new TextEncoder().encode(JSON.stringify(body));

		return this.settled(this.transport.post(this.url('/command'), bytes, headers));
	}

	hello(): PendingRequest<PlayerAnswer<Hello | Problem>> {
		return this.settled(this.transport.get(this.url('/hello')));
	}

	mediaServer(
		token: string,
		body: MediaServer,
	): PendingRequest<PlayerAnswer<MediaServerAccepted | Problem>> {
		const headers = this.headers(token);
		headers['Content-Type'] = 'application/json';

		const bytes = new TextEncoder().encode(JSON.stringify(body));

		return this.settled(this.transport.put(this.url('/media-server'), bytes, headers));
	}

	pair(body: PairRequest): PendingRequest<PlayerAnswer<PairAccepted | Problem>> {
		const headers = this.headers();
		headers['Content-Type'] = 'application/json';

		const bytes = new TextEncoder().encode(JSON.stringify(body));

		return this.settled(this.transport.post(this.url('/pair'), bytes, headers));
	}

	// A 304 carries no body, so the snapshot is absent when the long poll ran out.
	state(
		token: string,
		since?: number,
	): PendingRequest<PlayerAnswer<StateSnapshot | Problem | undefined>> {
		const path = since === undefined ? '/state' : `/state?since=${since}`;

		return this.settled(this.transport.get(this.url(path), this.headers(token)));
	}

	private headers(token?: string): HttpHeaders {
		const headers: HttpHeaders = {};

		if (this.apiVersion !== undefined) {
			headers['Atolla-API-Version'] = String(this.apiVersion);
		}

		if (token !== undefined) {
			headers.Authorization = `Bearer ${token}`;
		}

		return headers;
	}

	private settled<T>(request: PendingRequest<HttpResponse>): PendingRequest<PlayerAnswer<T>> {
		let cancel = (): void => {};

		const cancelled = new Promise<never>((_resolve, reject) => {
			// cancel last so a throw from it cannot skip the reject
			cancel = () => {
				reject(new Error(REQUEST_CANCELLED));
				request.cancel?.();
			};
		});

		const answered = Promise.resolve(request).then((response) => ({
			headers: response.headers,
			json: decode(response.body) as T,
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
