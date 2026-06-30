import type { FooterTab, HeaderTab } from '../models/App';

export type HeaderDescriptor =
	| { kind: 'title'; title: string }
	| {
			kind: 'library';
			activeTab: HeaderTab;
			letterFilter: string | null;
			onAlphabetLetterTap: (letter: string | null) => void;
			onTabTap: (tab: HeaderTab) => void;
	  };

type HeaderListener = () => void;

export class HeaderStore {
	private readonly descriptors = new Map<FooterTab, HeaderDescriptor>();
	private readonly listeners = new Set<HeaderListener>();
	private headerVisible = true;

	descriptorFor(tab: FooterTab): HeaderDescriptor | undefined {
		return this.descriptors.get(tab);
	}

	isVisible(): boolean {
		return this.headerVisible;
	}

	setDescriptor(tab: FooterTab, descriptor: HeaderDescriptor): void {
		this.descriptors.set(tab, descriptor);
		this.notify();
	}

	setVisible(visible: boolean): void {
		if (this.headerVisible === visible) {
			return;
		}
		this.headerVisible = visible;
		this.notify();
	}

	subscribe(listener: HeaderListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			listener();
		}
	}
}
