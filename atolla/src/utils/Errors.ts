// InternalError is a constant to use for sentinel errors.
export class InternalError<TErr extends string> {
	readonly err: TErr;

	constructor(code: TErr) {
		this.err = code;
	}
}

// UserError extends InternalError to add a user friendly error message.
// Intended to be localised and displayed in app.
export class UserError<TErr extends string> extends InternalError<TErr> {
	readonly detail: string;
	private readonly resolveMessage: string | (() => string);

	constructor(code: TErr, message: string | (() => string), detail = '') {
		super(code);
		this.resolveMessage = message;
		this.detail = detail;
	}

	get message(): string {
		return typeof this.resolveMessage === 'function' ? this.resolveMessage() : this.resolveMessage;
	}

	msg(): string {
		if (this.detail === '') return this.message;

		return `${this.message}: ${this.detail}`;
	}

	withDetail(detail: string): UserError<TErr> {
		return new UserError(this.err, this.resolveMessage, detail);
	}
}

export function isErrorConst(value: unknown): value is InternalError<string> {
	return value instanceof InternalError;
}

export function errorIs(value: unknown, sentinel: InternalError<string>): boolean {
	return isErrorConst(value) && value.err === sentinel.err;
}

export type ErrorType<
	ErrorConstMap extends Record<string, InternalError<string> | UserError<string>>,
> = ErrorConstMap[keyof ErrorConstMap];
