import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export type SortOrder = 'a-z' | 'z-a' | 'new-old' | 'old-new';

export const SortOrders = {
	aToZ: 'a-z' as SortOrder,
	newToOld: 'new-old' as SortOrder,
	oldToNew: 'old-new' as SortOrder,
	zToA: 'z-a' as SortOrder,
};

const _SORT_OPTIONS: Array<{ label: string; value: SortOrder }> = [
	{ label: 'a › z', value: SortOrders.aToZ },
	{ label: 'z › a', value: SortOrders.zToA },
	{ label: 'new › old', value: SortOrders.newToOld },
	{ label: 'old › new', value: SortOrders.oldToNew },
];

const ALPHA_TOP = '0ABCDEFGHIJKLM'.split('');
const ALPHA_BOTTOM = 'NOPQRSTUVWXYZ'.split('');

export interface SortNavPanelViewModel {
	activeLetterFilter: string | null;
	currentSort: SortOrder;
	onLetterTap?: (letter: string) => void;
	onSortChange: (sort: SortOrder) => void;
}

export class SortNavPanel extends Component<SortNavPanelViewModel> {
	onRender() {
		const { activeLetterFilter, onLetterTap } = this.viewModel;

		<view style={styles.panel}>
			<view style={styles.alphabetGrid}>
				<view style={styles.alphabetRow}>
					{ALPHA_TOP.map((letter) => (
						<view
							key={letter}
							onTap={() => onLetterTap?.(letter)}
							style={
								activeLetterFilter === letter ? styles.letterButtonActive : styles.letterButton
							}
						>
							{activeLetterFilter === letter && (
								<image src={res.headertabgradient} style={styles.letterGradient} />
							)}
							<label
								style={
									activeLetterFilter === letter ? styles.letterLabelActive : styles.letterLabel
								}
								value={letter}
							/>
						</view>
					))}
				</view>
				<view style={styles.alphabetRow}>
					{ALPHA_BOTTOM.map((letter) => (
						<view
							key={letter}
							onTap={() => onLetterTap?.(letter)}
							style={
								activeLetterFilter === letter ? styles.letterButtonActive : styles.letterButton
							}
						>
							{activeLetterFilter === letter && (
								<image src={res.headertabgradient} style={styles.letterGradient} />
							)}
							<label
								style={
									activeLetterFilter === letter ? styles.letterLabelActive : styles.letterLabel
								}
								value={letter}
							/>
						</view>
					))}
				</view>
			</view>

			{/* <view style={styles.divider} /> */}
			{/**/}
			{/* <label style={styles.sortLabel} value='SORT' /> */}
			{/* <view style={styles.sortRow}> */}
			{/* 	{SORT_OPTIONS.map(({ label, value }) => ( */}
			{/* 		<view */}
			{/* 			key={value} */}
			{/* 			onTap={() => onSortChange(value)} */}
			{/* 			style={currentSort === value ? styles.pillActive : styles.pill} */}
			{/* 		> */}
			{/* 			{currentSort === value && ( */}
			{/* 				<image src={res.headertabgradient} style={styles.pillGradient} /> */}
			{/* 			)} */}
			{/* 			<label */}
			{/* 				style={currentSort === value ? styles.pillLabelActive : styles.pillLabel} */}
			{/* 				value={label} */}
			{/* 			/> */}
			{/* 		</view> */}
			{/* 	))} */}
			{/* </view> */}
		</view>;
	}
}

const styles = {
	alphabetGrid: new Style<Layout>({
		flexDirection: 'column',
		paddingLeft: 8,
		paddingRight: 8,
	}),
	alphabetRow: new Style<Layout>({
		flexDirection: 'row',
		justifyContent: 'space-evenly',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 8,
		marginLeft: 4,
		marginRight: 4,
		marginTop: 8,
	}),
	letterButton: new Style<Layout>({
		alignItems: 'center',
		height: 24,
		justifyContent: 'center',
		marginLeft: 1,
		marginRight: 1,
		width: 24,
	}),
	letterButtonActive: new Style({
		alignItems: 'center' as const,
		borderRadius: 12,
		height: 24,
		justifyContent: 'center' as const,
		marginLeft: 1,
		marginRight: 1,
		position: 'relative' as const,
		slowClipping: true,
		width: 24,
	}),
	letterGradient: new Style<ImageView>({
		borderRadius: 999,
		bottom: 0,
		left: 0,
		position: 'absolute' as const,
		right: 0,
		top: 0,
	}),
	letterLabel: new Style<Label>({
		...theme.text.mainMuted,
	}),
	letterLabelActive: new Style<Label>({
		...theme.text.mainMuted,
		color: theme.colors.bg,
	}),
	panel: new Style({
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: theme.borderRadius,
		left: 16,
		paddingBottom: 10,
		paddingTop: 10,
		position: 'absolute' as const,
		right: 16,
		top: theme.headerHeight + 6,
		zIndex: 11,
	}),
	pill: new Style({
		backgroundColor: theme.colors.bgRaised,
		borderRadius: 20,
		marginRight: 8,
		paddingBottom: 7,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: 7,
		position: 'relative' as const,
		slowClipping: true,
	}),
	pillActive: new Style({
		borderRadius: 20,
		marginRight: 8,
		paddingBottom: 7,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: 7,
		position: 'relative' as const,
		slowClipping: true,
	}),
	pillGradient: new Style({
		borderRadius: 20,
		bottom: 0,
		left: 0,
		position: 'absolute' as const,
		right: 0,
		top: 0,
	}),
	pillLabel: new Style<Label>({
		...theme.text.mainMuted,
	}),
	pillLabelActive: new Style<Label>({
		...theme.text.mainMuted,
		color: theme.colors.bg,
	}),
	sortLabel: new Style({
		...theme.text.mainBold,
		marginLeft: 10,
		padding: 8,
	}),
	sortRow: new Style<Layout>({
		flexDirection: 'row',
		paddingLeft: 8,
		paddingRight: 8,
	}),
};
