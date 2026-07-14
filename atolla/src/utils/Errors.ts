export class ErrorConst<TErr extends string> {
	readonly err: TErr;
	readonly message: string;
	readonly detail: string;

	constructor(code: TErr, message: string, detail = '') {
		this.err = code;
		this.message = message;
		this.detail = detail;
	}

	msg(): string {
		if (this.detail === '') return this.message;

		return `${this.message}: ${this.detail}`;
	}

	withDetail(detail: string): ErrorConst<TErr> {
		return new ErrorConst(this.err, this.message, detail);
	}
}

export type ErrorType<ErrorConstMap extends Record<string, ErrorConst<string>>> =
	ErrorConstMap[keyof ErrorConstMap];
