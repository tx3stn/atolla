import { Device } from 'valdi_core/src/Device';
import { setAtollaStatusBarColor } from '../StatusBarNative';
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

/**
 * Single owner of the colours of the bars framing the now-playing surface:
 * the device status bar (header) and the FooterNav (footer). NowPlayingSurface
 * drives both from inside its expand/collapse animation so the timing can be
 * tuned per bar. The header is pushed straight to the OS (Android only, like
 * before); the footer (background + icon tints) is observable state that
 * FooterNav renders.
 */
export class BarColorStore {
	private listeners = new Set<BarColorListener>();
	private currentFooter: FooterColors = defaultFooterColors;

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
		if (Device.isAndroid()) {
			setAtollaStatusBarColor(color);
		}
	}

	subscribe(listener: BarColorListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
