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

export const headerStore = new HeaderStore();

const COLLAPSE_TOP_THRESHOLD = 8;
const COLLAPSE_TRIGGER = 24;

export class HeaderCollapse {
	private accumulatedDown = 0;
	private accumulatedUp = 0;
	private lastY = 0;

	constructor(private readonly store: HeaderStore) {}

	handleScroll(y: number): void {
		if (y <= COLLAPSE_TOP_THRESHOLD) {
			this.lastY = y;
			this.accumulatedDown = 0;
			this.accumulatedUp = 0;
			this.store.setVisible(true);
			return;
		}
		const delta = y - this.lastY;
		this.lastY = y;
		if (delta > 0) {
			this.accumulatedDown += delta;
			this.accumulatedUp = 0;
			if (this.accumulatedDown > COLLAPSE_TRIGGER) {
				this.store.setVisible(false);
			}
		} else if (delta < 0) {
			this.accumulatedUp -= delta;
			this.accumulatedDown = 0;
			if (this.accumulatedUp > COLLAPSE_TRIGGER) {
				this.store.setVisible(true);
			}
		}
	}

	reset(): void {
		this.lastY = 0;
		this.accumulatedDown = 0;
		this.accumulatedUp = 0;
		this.store.setVisible(true);
	}
}
