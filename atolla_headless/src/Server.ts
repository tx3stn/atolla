import { getLogger } from 'atolla_core/src/services/Logger';
import type { Answer, HttpServer } from './Http';
import { handlePair, type PairDeps } from './routes/Pair';

export const ROUTE = {
	hello: 0,
	intent: 2,
	pair: 1,
	state: 3,
} as const;

export interface ServerDeps {
	pair: PairDeps;
}

const log = getLogger('server-js');

export function attachServer(httpServer: HttpServer, deps: ServerDeps): void {
	httpServer.setHandler((requestId, route, target, body) => {
		let answer: Promise<Answer>;

		switch (route) {
			case ROUTE.pair:
				answer = handlePair(deps.pair, body);
				break;

			default:
				log.warn('route not implemented', { bodyBytes: body.length, route, target });
				answer = Promise.resolve({ body: '', status: 501 });
		}

		answer.then(
			(resolved) => {
				httpServer.respond(requestId, resolved.status, resolved.body);
			},
			(error: unknown) => {
				log.error('route threw', { error: String(error), route, target });
				httpServer.respond(requestId, 500, '');
			},
		);
	});
}
