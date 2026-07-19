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

export function isErrorConst(value: unknown): value is ErrorConst<string> {
	return value instanceof ErrorConst;
}

// normalises an unknown throw into an ErrorConst so callers can always render msg() safely. a value
// that is already an ErrorConst passes through, even a foreign one — it still renders, and the
// alternative is discarding a usable error. anything else takes the fallback, carrying whatever
// detail could be recovered from the cause so an unexpected throw isn't reduced to a bare message.
export function toErrorConst<TError extends ErrorConst<string>>(
	cause: unknown,
	fallback: TError,
): TError {
	if (isErrorConst(cause)) {
		return cause as TError;
	}

	const detail = detailOf(cause);

	return detail ? (fallback.withDetail(detail) as TError) : fallback;
}

export type ErrorType<ErrorConstMap extends Record<string, ErrorConst<string>>> =
	ErrorConstMap[keyof ErrorConstMap];

function detailOf(cause: unknown): string {
	if (typeof cause === 'string') return cause;
	if (cause instanceof Error) return cause.message;

	return '';
}
