import type { LogLevel } from 'atolla_core/src/services/Logger';

// The answer goes back through `respond` and need not be on this call: the connection waits.
export type RequestHandler = (
	requestId: number,
	route: number,
	target: string,
	body: string,
) => void;

export interface HttpServer {
	respond: (requestId: number, status: number, body: string) => boolean;
	setHandler: (handler: RequestHandler) => void;
	setHelloBody: (body: string) => void;
	setLogLevel: (level: LogLevel) => void;
	start: (host: string, port: number) => number;
	stop: () => void;
}
