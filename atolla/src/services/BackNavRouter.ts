import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { FooterTab } from '../models/App';

/**
 * Android routes the OS back button/gesture through a single global observer
 * (`Device.setBackButtonObserver`), so the shell — not each tab's NavigationView — has to handle
 * Back when every tab stays mounted. A tab's root NavigationController can't go back (its `pop()`
 * pops relative to stack index 0, which is a no-op), so each pushed page registers its own
 * controller here as it mounts; Back pops the top page of whichever tab is currently visible.
 *
 * Pages are attributed to the tab that is active when they mount, which is the tab they were
 * pushed into. (A future cross-tab programmatic push would need to pass the target tab explicitly.)
 */
export class BackNavRouter {
	private readonly stacks = new Map<FooterTab, Array<NavigationController>>();
	private readonly returnTo = new Map<FooterTab, FooterTab>();
	private activeTab?: FooterTab;
	private tabSwitcher?: (tab: FooterTab) => void;

	clearReturnTo(): void {
		this.returnTo.clear();
	}

	goBack(): boolean {
		if (this.activeTab === undefined) {
			return false;
		}
		const stack = this.stacks.get(this.activeTab);
		const top = stack?.[stack.length - 1];
		if (!top) {
			return false;
		}
		top.pop(true);
		return true;
	}

	registerPage(controller: NavigationController): void {
		if (this.activeTab === undefined) {
			return;
		}
		const stack = this.stacks.get(this.activeTab) ?? [];
		stack.push(controller);
		this.stacks.set(this.activeTab, stack);
	}

	setActiveTab(tab: FooterTab): void {
		this.activeTab = tab;
	}

	// Records that emptying `target`'s detail stack should return the shell to `origin` — used when a
	// cross-tab tap (Home/Search/Now-Playing) opens a detail in the Library tab.
	setReturnTo(target: FooterTab, origin: FooterTab): void {
		if (target === origin) {
			return;
		}
		this.returnTo.set(target, origin);
	}

	setTabSwitcher(switcher: ((tab: FooterTab) => void) | null): void {
		this.tabSwitcher = switcher ?? undefined;
	}

	unregisterPage(controller: NavigationController): void {
		for (const [tab, stack] of this.stacks) {
			const index = stack.lastIndexOf(controller);
			if (index >= 0) {
				stack.splice(index, 1);
				this.maybeScheduleReturn(tab);
				return;
			}
		}
	}

	// Library's openDetail unwinds the current detail before pushing the next, briefly emptying the
	// stack; defer and re-check so an unwind-then-repush doesn't read as a real back-out. A genuine
	// back leaves the stack empty, so the deferred check returns the shell to the recorded origin.
	private maybeScheduleReturn(tab: FooterTab): void {
		if (!this.returnTo.has(tab)) {
			return;
		}
		void Promise.resolve().then(() => {
			const stack = this.stacks.get(tab);
			if ((stack && stack.length > 0) || this.activeTab !== tab) {
				return;
			}
			const origin = this.returnTo.get(tab);
			this.returnTo.delete(tab);
			if (origin !== undefined) {
				this.tabSwitcher?.(origin);
			}
		});
	}
}

export const backNavRouter = new BackNavRouter();
