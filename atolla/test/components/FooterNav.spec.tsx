import 'jasmine/src/jasmine';
import { BarColorStore } from 'atolla/src/stores/BarColor';
import { theme } from 'atolla/src/theme';
import { FooterNav } from 'atolla/src/ui/components/FooterNav';
import { FooterTabs } from 'atolla/src/ui/components/FooterTab';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

function getRootView(component: Parameters<typeof componentGetElements>[0]) {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	return views[0];
}

describe('FooterNav', () => {
	valdiIt('renders the bar store footer colour', async () => {
		const barColors = new BarColorStore();
		const instrumented = createComponent(FooterNav, {
			activeTab: FooterTabs.home,
			barColors,
			downloadingCount: 0,
			onFooterTabTap: () => {},
		});
		const component = instrumented.getComponent();

		expect(getRootView(component).getAttribute('backgroundColor')).toBe(theme.colors.bgFrosted);
	});

	valdiIt('updates the footer colour when the bar store changes', async () => {
		const barColors = new BarColorStore();
		const instrumented = createComponent(FooterNav, {
			activeTab: FooterTabs.home,
			barColors,
			downloadingCount: 0,
			onFooterTabTap: () => {},
		});
		const component = instrumented.getComponent();

		const newColor = 'rgba(17,26,43,0.8)';
		barColors.setFooterColor(newColor);

		expect(getRootView(component).getAttribute('backgroundColor')).toBe(newColor);
	});
});
