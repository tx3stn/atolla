import 'jasmine/src/jasmine';
import { FooterTabs } from 'atolla/src/models/App';
import { BarColorStore } from 'atolla/src/stores/BarColor';
import { theme } from 'atolla/src/theme';
import { FooterNav } from 'atolla/src/ui/components/FooterNav';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

function getRootView(component: Parameters<typeof componentGetElements>[0]) {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	return views[0];
}

function getIconTints(component: Parameters<typeof componentGetElements>[0]) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Image).map(
		(image) => image.getAttribute('tint'),
	);
}

function createFooterNav(barColors: BarColorStore) {
	return createComponent(FooterNav, {
		activeTab: FooterTabs.home,
		barColors,
		downloadingCount: 0,
		onFooterTabTap: () => {},
	});
}

describe('FooterNav', () => {
	valdiIt('renders the default footer colours', async () => {
		const component = createFooterNav(new BarColorStore()).getComponent();

		expect(getRootView(component).getAttribute('backgroundColor')).toBe(theme.colors.bgFrosted);

		const tints = getIconTints(component);
		expect(tints[0]).toBe(undefined);
		expect(tints[1]).toBe(theme.colors.grey);
	});

	valdiIt('reflects the bar store footer colours', async () => {
		const footer = {
			activeIconColor: '#d8dee9',
			background: 'rgba(17,26,43,0.8)',
			inactiveIconColor: '#667085',
		};
		const barColors = new BarColorStore();
		const component = createFooterNav(barColors).getComponent();

		barColors.setFooter(footer);

		expect(getRootView(component).getAttribute('backgroundColor')).toBe(footer.background);

		const tints = getIconTints(component);
		expect(tints[0]).toBe(footer.activeIconColor);
		expect(tints[1]).toBe(footer.inactiveIconColor);
	});
});
