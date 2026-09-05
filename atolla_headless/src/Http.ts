export interface HttpServer {
	start: (port: number) => number;
	stop: () => void;
}
