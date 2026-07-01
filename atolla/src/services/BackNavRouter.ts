import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { FooterTab } from '../models/App';

// android routes the OS back button/gesture through a single global observer
// so the shell has to handle back rather than the tab's NavigationView.
// tab's root NavigationController can't go back (its `pop()` pops relative to
// stack index 0, which is a no-op), so each pushed page registers its own
// controller here as it mounts. back pops the top page of whichever tab is currently visible.
export class BackNavRouter {
	private readonly stacks = new Map<FooterTab, Array<NavigationController>>();
	private activeTab?: FooterTab;

	firstPageOf(tab: FooterTab): NavigationController | undefined {
		return this.stacks.get(tab)?.[0];
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

	unregisterPage(controller: NavigationController): void {
		for (const [, stack] of this.stacks) {
			const index = stack.lastIndexOf(controller);
			if (index >= 0) {
				stack.splice(index, 1);
				return;
			}
		}
	}
}

export const backNavRouter = new BackNavRouter();
