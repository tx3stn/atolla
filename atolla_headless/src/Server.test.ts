import { describe, expect, it } from 'bun:test';
import type { HttpServer, RequestHandler } from './Http';
import { answerFor, attachServer, ROUTE } from './Server';

function fakeHttpServer(answers: Array<{ body: string; requestId: number; status: number }>) {
	let handler: RequestHandler | undefined;

	const httpServer: HttpServer = {
		respond: (requestId, status, body) => {
			answers.push({ body, requestId, status });
			return true;
		},
		setHandler: (given) => {
			handler = given;
		},
		setHelloBody: () => {},
		setLogLevel: () => {},
		start: (_host, port) => port,
		stop: () => {},
	};

	return { dispatch: (...args: Parameters<RequestHandler>) => handler?.(...args), httpServer };
}

describe('answerFor', () => {
	it('reports a route the server knows but this side has not implemented', () => {
		for (const route of [ROUTE.pair, ROUTE.intent, ROUTE.state]) {
			const answer = answerFor(route, '/whatever', '');

			expect(answer.status).toBe(501);
			expect(JSON.parse(answer.body)).toEqual({ error: 'notImplemented' });
		}
	});

	// the server should never send one, so it means the two route tables have drifted apart
	it('reports a route it has never heard of', () => {
		const answer = answerFor(99, '/whatever', '');

		expect(answer.status).toBe(500);
		expect(JSON.parse(answer.body)).toEqual({ error: 'unknownRoute' });
	});
});

describe('attachServer', () => {
	it('answers the request it was dispatched, against its id', () => {
		const answers: Array<{ body: string; requestId: number; status: number }> = [];
		const { dispatch, httpServer } = fakeHttpServer(answers);

		attachServer(httpServer);
		dispatch(4242, ROUTE.pair, '/pair', '');

		expect(answers).toEqual([
			{ body: JSON.stringify({ error: 'notImplemented' }), requestId: 4242, status: 501 },
		]);
	});

	it('answers a request that carries a body', () => {
		const answers: Array<{ body: string; requestId: number; status: number }> = [];
		const { dispatch, httpServer } = fakeHttpServer(answers);

		attachServer(httpServer);
		dispatch(7, ROUTE.pair, '/pair', '{"code":"19524002"}');

		expect(answers).toEqual([
			{ body: JSON.stringify({ error: 'notImplemented' }), requestId: 7, status: 501 },
		]);
	});
});
