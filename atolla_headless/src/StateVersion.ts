// Orders the changes a controller mirrors. It is not a count of commands: one command can settle
// several fields, and a track finishing changes the state with no command behind it.
export interface StateVersion {
	bump: () => void;
	readonly current: number;
}

export function makeStateVersion(): StateVersion {
	let current = 1;

	return {
		bump: () => {
			current += 1;
		},
		get current() {
			return current;
		},
	};
}
