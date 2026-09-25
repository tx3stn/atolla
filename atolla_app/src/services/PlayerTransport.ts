import { getLogger } from 'atolla_core/src/services/Logger';
import { defaultTimer, type TimerFn } from 'atolla_core/src/utils/Timer';
import type {
	HttpHeaders,
	HttpResponse,
	HttpTransport,
	PendingRequest,
} from 'atolla_sync/src/api/Transport';
import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import type { HTTPResponse } from 'valdi_http/src/HTTPTypes';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { PlayerErrors } from './PlayerErrors';

const log = getLogger('player-transport');

const defaultRequestTimeoutMs = 15_000;

interface PlayerTransportOptions {
	timeoutMs?: number;
	timer?: TimerFn;
}

export class PlayerTransport implements HttpTransport {
	private readonly timeoutMs: number;
	private readonly timer: TimerFn;

	constructor(
		private readonly client: IHTTPClient,
		options: PlayerTransportOptions = {},
	) {
		this.timeoutMs = options.timeoutMs ?? defaultRequestTimeoutMs;
		this.timer = options.timer ?? defaultTimer;
	}

	get(url: string, headers?: HttpHeaders): PendingRequest<HttpResponse> {
		return this.withDeadline(this.client.get(url, headers), 'GET', url);
	}

	post(url: string, body?: Uint8Array, headers?: HttpHeaders): PendingRequest<HttpResponse> {
		return this.withDeadline(this.client.post(url, body, headers), 'POST', url);
	}

	put(url: string, body?: Uint8Array, headers?: HttpHeaders): PendingRequest<HttpResponse> {
		return this.withDeadline(this.client.put(url, body, headers), 'PUT', url);
	}

	private withDeadline(
		request: CancelablePromise<HTTPResponse>,
		method: string,
		url: string,
	): PendingRequest<HttpResponse> {
		const answered = new Promise<HttpResponse>((resolve, reject) => {
			let settled = false;
			const finish = (): boolean => {
				if (settled) return false;
				settled = true;

				return true;
			};

			// cancel last so a throw from it cannot skip the reject
			const clearDeadline = this.timer(() => {
				if (!finish()) return;

				log.warn('request timed out', { method, timeoutMs: this.timeoutMs, url });
				reject(PlayerErrors.PLAYER_TIMED_OUT);
				request.cancel?.();
			}, this.timeoutMs);

			request.then(
				(response) => {
					if (!finish()) return;

					clearDeadline();
					resolve(response);
				},
				(error: unknown) => {
					if (!finish()) return;

					clearDeadline();
					reject(error);
				},
			);
		});

		return Object.assign(answered, { cancel: () => request.cancel?.() });
	}
}
