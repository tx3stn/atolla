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
	private activeTab?: FooterTab;

	setActiveTab(tab: FooterTab): void {
		this.activeTab = tab;
	}

	registerPage(controller: NavigationController): void {
		if (this.activeTab === undefined) {
			return;
		}
		const stack = this.stacks.get(this.activeTab) ?? [];
		stack.push(controller);
		this.stacks.set(this.activeTab, stack);
	}

	unregisterPage(controller: NavigationController): void {
		for (const stack of this.stacks.values()) {
			const index = stack.lastIndexOf(controller);
			if (index >= 0) {
				stack.splice(index, 1);
				return;
			}
		}
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
}

export const backNavRouter = new BackNavRouter();
