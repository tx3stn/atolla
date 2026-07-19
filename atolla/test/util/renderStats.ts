import type { IComponent } from 'valdi_core/src/IComponent';
import type { ComponentCtor, IRendererEventListener } from 'valdi_core/src/IRendererEventListener';

// counts how often each component actually re-rendered versus was skipped, so perf specs can
// assert on viewModel identity rather than eyeballing it. Valdi visits every component in a
// render pass (onComponentBegin) but emits onBypassComponentRender for the ones whose viewModel
// compared equal, so renders = visits - bypasses.
//
// changedProps is a diagnostic hint, not an exhaustive list: Renderer.setViewModelProperty only
// emits the change event for the FIRST prop that differs in a pass — once the component is marked
// viewModelChanged, subsequent differing props are written without an event.
//
// only child components are counted. begin/end are emitted by the parent rendering JSX, so a root
// component re-rendering via setState reports zero visits for itself; assert on its children.
export class RenderStats implements IRendererEventListener {
	private bypassCounts = new Map<string, number>();
	private changedPropsByComponent = new Map<string, Set<string>>();
	private componentStack: Array<string> = [];
	private visitCounts = new Map<string, number>();

	bypasses(componentName: string): number {
		return this.bypassCounts.get(componentName) ?? 0;
	}

	changedProps(componentName: string): Set<string> {
		return new Set(this.changedPropsByComponent.get(componentName));
	}

	onBypassComponentRender(): void {
		const componentName = this.currentComponent();
		if (componentName === undefined) return;

		this.bypassCounts.set(componentName, this.bypasses(componentName) + 1);
	}

	onComponentBegin(_key: string, componentCtor: ComponentCtor): void {
		const componentName = componentCtor.name;
		this.componentStack.push(componentName);
		this.visitCounts.set(componentName, this.visits(componentName) + 1);
	}

	onComponentEnd(): void {
		this.componentStack.pop();
	}

	onComponentViewModelPropertyChange(viewModelPropertyName: string): void {
		const componentName = this.currentComponent();
		if (componentName === undefined) return;

		const existing = this.changedPropsByComponent.get(componentName);
		if (existing) {
			existing.add(viewModelPropertyName);
			return;
		}

		this.changedPropsByComponent.set(componentName, new Set([viewModelPropertyName]));
	}

	onRenderBegin(): void {}

	onRenderEnd(): void {}

	renders(componentName: string): number {
		return this.visits(componentName) - this.bypasses(componentName);
	}

	reset(): void {
		this.bypassCounts.clear();
		this.changedPropsByComponent.clear();
		this.componentStack = [];
		this.visitCounts.clear();
	}

	visits(componentName: string): number {
		return this.visitCounts.get(componentName) ?? 0;
	}

	private currentComponent(): string | undefined {
		return this.componentStack[this.componentStack.length - 1];
	}
}

// the renderer holds a single event listener, so attaching again replaces the previous stats
export function attachRenderStats(component: IComponent): RenderStats {
	const stats = new RenderStats();
	component.renderer.setEventListener(stats);
	return stats;
}
