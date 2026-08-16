export function extractErrorMessage(e: unknown): string {
	if (e != null && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
		return e.message;
	}
	return 'Unknown error';
}

export function normalizeInputValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (value && typeof value === 'object') {
		const c = value as {
			nativeEvent?: { text?: unknown; value?: unknown };
			text?: unknown;
			value?: unknown;
		};
		const direct = c.text ?? c.value ?? c.nativeEvent?.text ?? c.nativeEvent?.value;
		if (typeof direct === 'string') return direct;
	}
	return '';
}
