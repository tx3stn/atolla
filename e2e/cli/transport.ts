import type {
	HttpHeaders,
	HttpResponse,
	HttpTransport,
	PendingRequest,
} from 'atolla_sync/src/api/Transport';

export class FetchTransport implements HttpTransport {
	get(url: string, headers?: HttpHeaders): PendingRequest<HttpResponse> {
		return this.send(url, { headers: fetchHeaders(headers), method: 'GET' });
	}

	post(url: string, body?: Uint8Array, headers?: HttpHeaders): PendingRequest<HttpResponse> {
		return this.send(url, {
			body: body as BodyInit | undefined,
			headers: fetchHeaders(headers),
			method: 'POST',
		});
	}

	private send(url: string, init: RequestInit): PendingRequest<HttpResponse> {
		const controller = new AbortController();

		const answered = fetch(url, { ...init, signal: controller.signal }).then(async (response) => ({
			body: new Uint8Array(await response.arrayBuffer()),
			headers: Object.fromEntries(response.headers) as HttpHeaders,
			statusCode: response.status,
		}));

		return Object.assign(answered, { cancel: () => controller.abort() });
	}
}

function fetchHeaders(headers?: HttpHeaders): Record<string, string> {
	const defined: Record<string, string> = {};

	for (const [name, value] of Object.entries(headers ?? {})) {
		if (value !== undefined) {
			defined[name] = value;
		}
	}

	return defined;
}
