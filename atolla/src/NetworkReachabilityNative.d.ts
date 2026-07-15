/**
 * @ExportModule
 */

// @ExportFunction
// current device reachability as JSON: {"reachable":boolean,"transport":"wifi"|"cellular"|"none"}
export function getAtollaNetworkStatus(): string;

// @ExportFunction
// fires whenever reachability/transport changes; the listener re-reads getAtollaNetworkStatus
export function setAtollaNetworkStatusObserver(onChange: () => void): void;

// @ExportFunction
export function clearAtollaNetworkStatusObserver(): void;
