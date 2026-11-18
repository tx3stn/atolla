import type { StateVersion } from './StateVersion';

export interface Assignment {
	assign: () => void;
	assigned: () => boolean;
}

export function makeAssignment(version: Pick<StateVersion, 'bump'>): Assignment {
	let isAssigned = false;

	return {
		assign: () => {
			if (isAssigned) {
				return;
			}

			isAssigned = true;
			version.bump();
		},
		assigned: () => isAssigned,
	};
}
