import 'jasmine/src/jasmine';
import type { LanguageCode } from 'atolla/src/stores/Preferences';
import { LanguageSelectModal } from 'atolla/src/ui/components/LanguageSelectModal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

// the options render into ModalBase's slot, so the lookup has to walk the whole subtree
function optionView(component: LanguageSelectModal, code: LanguageCode) {
	return elementTypeFind(
		component.renderer.getComponentRootElements(component, true),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityId') === `language-option-${code}`);
}

describe('LanguageSelectModal', () => {
	valdiIt('selects the tapped language', async (driver) => {
		const selected: Array<LanguageCode> = [];
		const component = driver.renderComponent(
			LanguageSelectModal,
			{
				onCancel: () => {},
				onSelect: (code: LanguageCode) => selected.push(code),
				selectedLanguage: 'en',
			},
			undefined,
		);

		optionView(component, 'fr')?.getAttribute('onTap')?.(touchEvent);

		expect(selected).toEqual(['fr']);
	});

	valdiIt('reuses the same handler for an option across renders', async (driver) => {
		const component = driver.renderComponent(
			LanguageSelectModal,
			{ onCancel: () => {}, onSelect: () => {}, selectedLanguage: 'en' },
			undefined,
		);
		const first = optionView(component, 'fr')?.getAttribute('onTap');
		expect(first).toBeDefined();

		component.renderer.renderComponent(component, undefined);

		expect(optionView(component, 'fr')?.getAttribute('onTap')).toBe(first);
	});
});
