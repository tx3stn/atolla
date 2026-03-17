export class ErrorConst<TErr extends string> {
	readonly err: TErr;
	readonly message: string;

	constructor(code: TErr, message: string) {
		this.err = code;
		this.message = message;
	}

	msg(): string {
		return this.message;
	}
}

export type ErrorType<ErrorConstMap extends Record<string, ErrorConst<string>>> =
	ErrorConstMap[keyof ErrorConstMap];
