// InternalError is a constant to use for sentinel errors. detail carries the specific cause; the
// surface that displays an error is what maps its code to localised copy.
export class InternalError<TErr extends string> {
	readonly detail: string;
	readonly err: TErr;

	constructor(code: TErr, detail = '') {
		this.detail = detail;
		this.err = code;
	}

	withDetail(detail: string): InternalError<TErr> {
		return new InternalError(this.err, detail);
	}
}

export function isErrorConst(value: unknown): value is InternalError<string> {
	return value instanceof InternalError;
}

export type ErrorType<ErrorConstMap extends Record<string, InternalError<string>>> =
	ErrorConstMap[keyof ErrorConstMap];
