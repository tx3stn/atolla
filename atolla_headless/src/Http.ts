import type { LogLevel } from 'atolla_core/src/services/Logger';

export interface HttpServer {
	setHelloBody: (body: string) => void;
	setLogLevel: (level: LogLevel) => void;
	start: (port: number) => number;
	stop: () => void;
}
