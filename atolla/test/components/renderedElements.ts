import type { IComponent } from 'valdi_core/src/IComponent';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';

// Collects rendered elements across child components so tests can introspect a
// component that composes shared building blocks (e.g. content placed in a
// ModalBase <slot/>); the default componentGetElements stops at child-component
// boundaries.
export function renderedElements(component: IComponent): Array<IRenderedElement> {
	return component.renderer.getComponentRootElements(component, true);
}
