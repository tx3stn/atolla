import Strings from 'atolla_headless/src/Strings';
import { USAGE_ERROR } from './Errors';
import type { Flags } from './Flags';

export interface ParsedArguments {
	flag(name: string): boolean;
	value(name: string): string | undefined;
}

export function parseArguments(argv: Array<string>, flags: Flags): ParsedArguments {
	const values = new Map<string, string | boolean>();

	for (let index = 0; index < argv.length; index++) {
		const name = argv[index];
		const declared = flags[name];

		if (declared === undefined) {
			throw USAGE_ERROR.withDetail(Strings.errorUnknownArgument(name));
		}
		if (values.has(name)) {
			throw USAGE_ERROR.withDetail(Strings.errorRepeatedArgument(name));
		}

		if (declared.kind === 'boolean') {
			values.set(name, true);
			continue;
		}

		index++;
		if (index >= argv.length) {
			throw USAGE_ERROR.withDetail(Strings.errorMissingValue(name));
		}
		values.set(name, argv[index]);
	}

	return {
		flag: (name) => values.get(name) === true,
		value: (name) => {
			const value = values.get(name);
			return typeof value === 'string' ? value : undefined;
		},
	};
}
