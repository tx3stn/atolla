export type RandomBytes = (count: number) => Uint8Array;

// FIXME: replace with a Zig CSPRNG. Math.random is the only source the Valdi runtime exposes to JS —
// there is no crypto.getRandomValues, and /dev/urandom is unreachable through file_system — and
// QuickJS seeds it from time-of-day, so what this produces is predictable.
export const mathRandomBytes: RandomBytes = (count) =>
	Uint8Array.from({ length: count }, () => Math.floor(Math.random() * 256));
