import { Device } from 'valdi_core/src/Device';
import { setAtollaNavigationBarColor, setAtollaStatusBarColor } from '../StatusBarNative';
import { theme } from '../theme';

type BarColorListener = () => void;

export interface FooterColors {
	activeIconColor?: string;
	background: string;
	inactiveIconColor: string;
}

export const defaultFooterColors: FooterColors = {
	background: theme.colors.bgFrosted,
	inactiveIconColor: theme.colors.grey,
};

// single owner of the bar colours framing the now-playing surface: status bar (header) and FooterNav (footer)
// NowPlayingSurface drives both from its expand/collapse animation so timing tunes per bar
// header pushes straight to the OS (Android only); footer is observable state FooterNav renders
export class BarColorStore {
	private listeners = new Set<BarColorListener>();
	private currentFooter: FooterColors = defaultFooterColors;
	private currentHeaderColor?: string;
	private currentNavBarColor?: string;

	get footer(): FooterColors {
		return this.currentFooter;
	}

	setFooter(colors: FooterColors): void {
		const current = this.currentFooter;
		if (
			current.background === colors.background &&
			current.activeIconColor === colors.activeIconColor &&
			current.inactiveIconColor === colors.inactiveIconColor
		) {
			return;
		}
		this.currentFooter = colors;
		for (const listener of [...this.listeners]) {
			listener();
		}
	}

	resetFooter(): void {
		this.setFooter(defaultFooterColors);
	}

	setHeaderColor(color: string): void {
		if (color === this.currentHeaderColor) {
			return;
		}
		this.currentHeaderColor = color;
		if (Device.isAndroid()) {
			setAtollaStatusBarColor(color);
		}
	}

	setNavigationBarColor(color: string): void {
		if (color === this.currentNavBarColor) {
			return;
		}
		this.currentNavBarColor = color;
		if (Device.isAndroid()) {
			setAtollaNavigationBarColor(color);
		}
	}

	subscribe(listener: BarColorListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
