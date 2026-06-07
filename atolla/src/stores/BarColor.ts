import { Device } from 'valdi_core/src/Device';
import { setAtollaStatusBarColor } from '../StatusBarNative';
import { theme } from '../theme';

type BarColorListener = () => void;

/**
 * Single owner of the colours of the bars framing the now-playing surface:
 * the device status bar (header) and the FooterNav (footer). NowPlayingSurface
 * drives both from inside its expand/collapse animation so the timing can be
 * tuned per bar. The header is pushed straight to the OS (Android only, like
 * before); the footer is observable state that FooterNav renders.
 */
export class BarColorStore {
	private listeners = new Set<BarColorListener>();
	private currentFooterColor: string = theme.colors.bgFrosted;

	get footerColor(): string {
		return this.currentFooterColor;
	}

	setFooterColor(color: string): void {
		if (this.currentFooterColor === color) {
			return;
		}
		this.currentFooterColor = color;
		for (const listener of [...this.listeners]) {
			listener();
		}
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
