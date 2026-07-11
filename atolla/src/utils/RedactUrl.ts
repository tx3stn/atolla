// central list of query-param names that carry secrets, used to redact URLs before they reach
// logs or diagnostics. 'tok' is the atolla-cache scheme's token param; the rest are Jellyfin's.
export const SENSITIVE_PARAM =
	/^(api_?key|access_?token|token|tok|x[-_]?emby[-_]?token|password|pwd|auth|secret)$/i;

// param/field names that carry PII (which account, which device) rather than secrets — masked so a
// shared diagnostic log can't identify the user or device behind a request.
export const PII_PARAM = /^(user_?id|device_?id)$/i;

function isRedactableKey(key: string): boolean {
	return SENSITIVE_PARAM.test(key) || PII_PARAM.test(key);
}

// scrubs secrets and PII from any text — a bare URL or a blob (e.g. serialized JSON) that embeds
// URLs — before it reaches logs: the scheme+host of http(s) URLs, sensitive/PII query-param values
// (?key=value), and sensitive/PII JSON field values ("key":value). tokens travel out-of-band as
// headers and never in URLs, but any stray secret in a logged string is redacted here too.
export function redactSensitiveUrlParams(text: string): string {
	return text
		.replace(/\bhttps?:\/\/[^/?#\s"']+/gi, '<host>')
		.replace(/([?&])([^=&"'\s]+)=([^&"'\s]*)/g, (match, separator, key) =>
			isRedactableKey(key) ? `${separator}${key}=<redacted>` : match,
		)
		.replace(
			/"([A-Za-z0-9_-]+)"(\s*:\s*)("(?:[^"\\]|\\.)*"|-?\d[\w.+-]*|true|false|null)/g,
			(match, key, colon) => (isRedactableKey(key) ? `"${key}"${colon}"<redacted>"` : match),
		);
}
