// central list of query-param names that carry secrets, used to redact URLs before they reach
// logs or diagnostics. 'tok' is the atolla-cache scheme's token param; the rest are Jellyfin's.
export const SENSITIVE_PARAM =
	/^(api_?key|access_?token|token|tok|x[-_]?emby[-_]?token|password|pwd|auth|secret)$/i;

// scrubs sensitive query-param values from any text — a bare URL or a blob (e.g. serialized JSON)
// that embeds URLs — leaving everything else intact. defensive: tokens travel out-of-band as
// headers and never in URLs, but any stray secret in a logged string is redacted here
export function redactSensitiveUrlParams(text: string): string {
	return text.replace(/([?&])([^=&"'\s]+)=([^&"'\s]*)/g, (match, separator, key) =>
		SENSITIVE_PARAM.test(key) ? `${separator}${key}=<redacted>` : match,
	);
}
