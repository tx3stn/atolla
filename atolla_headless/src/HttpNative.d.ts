// Must be called before atollaHttpStart: the connection threads read it without locking.
export function atollaHttpSetHelloBody(body: string): void;

// Returns the port actually bound, which differs from the one asked for when 0 requests an
// ephemeral one.
export function atollaHttpStart(port: number): number;

export function atollaHttpStop(): void;
