// returns its own clear function, so a deadline that is no longer needed is dropped rather than
// left to outlive the request it was guarding
export type TimerFn = (callback: () => void, ms: number) => () => void;

export function defaultTimer(callback: () => void, ms: number): () => void {
	const id = setTimeout(callback, ms);

	return () => clearTimeout(id);
}
