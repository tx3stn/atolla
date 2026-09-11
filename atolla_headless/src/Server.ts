import { getLogger } from 'atolla_core/src/services/Logger';
import type { Answer, HttpServer } from './Http';
import { type CommandDeps, handleCommand } from './routes/Command';
import { handlePair, type PairDeps } from './routes/Pair';
import { handleState, type StateDeps } from './routes/State';

export const ROUTE = {
	command: 2,
	hello: 0,
	pair: 1,
	state: 3,
} as const;

export interface ServerDeps {
	command: CommandDeps;
	pair: PairDeps;
	state: StateDeps;
}

const log = getLogger('server-js');

export function attachServer(httpServer: HttpServer, deps: ServerDeps): void {
	httpServer.setHandler((requestId, route, target, body) => {
		let answer: Promise<Answer>;

		switch (route) {
			case ROUTE.command:
				answer = handleCommand(deps.command, body);
				break;

			case ROUTE.pair:
				answer = handlePair(deps.pair, body);
				break;

			case ROUTE.state:
				answer = handleState(deps.state, target);
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
