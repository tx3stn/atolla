/**
 * @ExportModule
 */

export function getAtollaLogFilePath(): string;
export function writeAtollaLog(entry: string): void;
export function clearAtollaLog(): void;
export function exportAtollaLog(): string;
export function shareAtollaLog(): void;
export function exportAtollaTextFile(fileName: string, contents: string): string;
export function shareAtollaTextFile(fileName: string, contents: string): void;
