/**
 * @ExportModule
 */

export function getAtollaDebugLogFilePath(): string;
export function writeAtollaDebugLog(entry: string): void;
export function clearAtollaDebugLog(): void;
export function exportAtollaDebugLog(): string;
export function shareAtollaDebugLog(): void;
export function exportAtollaTextFile(fileName: string, contents: string): string;
export function shareAtollaTextFile(fileName: string, contents: string): void;
