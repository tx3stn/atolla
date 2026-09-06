import { getLogger } from 'atolla_core/src/services/Logger';
import type { HttpServer } from './Http';

// Mirrors the Route enum in native/zig/router.zig. The server sends the number, never the name.
export const ROUTE = {
	hello: 0,
	intent: 2,
	pair: 1,
	state: 3,
} as const;

export interface Answer {
	body: string;
	status: number;
}

const log = getLogger('server-js');

export function attachServer(httpServer: HttpServer): void {
	httpServer.setHandler((requestId, route, target) => {
		const answer = answerFor(route, target);

		httpServer.respond(requestId, answer.status, answer.body);
	});
}

export function answerFor(route: number, target: string): Answer {
	switch (route) {
		case ROUTE.pair:
		case ROUTE.intent:
		case ROUTE.state:
			log.warn('route not implemented', { route, target });
			return { body: JSON.stringify({ error: 'notImplemented' }), status: 501 };
		default:
			log.error('route has no handler', { route, target });
			return { body: JSON.stringify({ error: 'unknownRoute' }), status: 500 };
	}
}
