export interface HttpServer {
	setHelloBody: (body: string) => void;
	start: (port: number) => number;
	stop: () => void;
}
