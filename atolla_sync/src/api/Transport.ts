export interface HttpHeaders {
	[name: string]: string | undefined;
}

export interface HttpResponse {
	body?: Uint8Array;
	headers: HttpHeaders;
	statusCode: number;
}

export interface PendingRequest<T> extends PromiseLike<T> {
	cancel?(): void;
}

export interface HttpTransport {
	get(url: string, headers?: HttpHeaders): PendingRequest<HttpResponse>;
	post(url: string, body?: Uint8Array, headers?: HttpHeaders): PendingRequest<HttpResponse>;
}
