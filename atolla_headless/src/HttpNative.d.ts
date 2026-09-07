// Must be called before atollaHttpStart: the connection threads read it without locking.
export function atollaHttpSetHelloBody(body: string): void;

// Called on a connection thread for every request the server cannot answer itself, and marshalled
// onto this one. The connection waits until atollaHttpRespond carries the answer back.
export function atollaHttpSetHandler(
	handler: (requestId: number, route: number, target: string, body: string) => void,
): void;

// False when nothing is waiting for the request any more, which is what an answer arriving after
// its timeout looks like.
export function atollaHttpRespond(requestId: number, status: number, body: string): boolean;

// An index into LOG_LEVELS. The server logs its own requests rather than crossing the bridge.
export function atollaHttpSetLogLevel(level: number): void;

export function atollaHttpSetPairingCodePath(path: string): void;

// Returns the port actually bound, which differs from the one asked for when 0 requests an
// ephemeral one. `host` is an IPv4 address; 0.0.0.0 serves every interface.
export function atollaHttpStart(host: string, port: number): number;

export function atollaHttpStop(): void;
