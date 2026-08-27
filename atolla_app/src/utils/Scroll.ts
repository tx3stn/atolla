export function pullDistance(y: number, overscrollTensionY: number | undefined): number {
	return Math.max(0, -y) + Math.max(0, -(overscrollTensionY ?? 0));
}
