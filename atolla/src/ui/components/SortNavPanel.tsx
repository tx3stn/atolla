import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type SortOrder, SortOrders } from '../../models/App';
import { theme } from '../../theme';

export { type SortOrder, SortOrders };

const ALPHA_TOP = '0ABCDEFGHIJKLM'.split('');
const ALPHA_BOTTOM = 'NOPQRSTUVWXYZ'.split('');

export interface SortNavPanelViewModel {
	activeLetterFilter: string | null;
	onLetterTap?: (letter: string) => void;
}

export class SortNavPanel extends Component<SortNavPanelViewModel> {
	private readonly letterTapHandlers = new Map<string, () => void>();

	private getLetterTapHandler = (letter: string): (() => void) => {
		const existing = this.letterTapHandlers.get(letter);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			this.viewModel.onLetterTap?.(letter);
		};
		this.letterTapHandlers.set(letter, handler);
		return handler;
	};

	onRender() {
		const { activeLetterFilter } = this.viewModel;

		<view style={styles.panel}>
			<view style={styles.alphabetGrid}>
				<view style={styles.alphabetRow}>
					{ALPHA_TOP.map((letter) => (
						<view
							key={letter}
							onTap={this.getLetterTapHandler(letter)}
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
							onTap={this.getLetterTapHandler(letter)}
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
	letterButton: new Style<Layout>({
		alignItems: 'center',
		height: 24,
		justifyContent: 'center',
		marginLeft: 1,
		marginRight: 1,
		width: 24,
	}),
	letterButtonActive: new Style<View>({
		alignItems: 'center' as const,
		borderRadius: theme.radius.pill,
		height: 24,
		justifyContent: 'center' as const,
		marginLeft: 1,
		marginRight: 1,
		position: 'relative' as const,
		slowClipping: true,
		width: 24,
	}),
	letterGradient: new Style<ImageView>({
		borderRadius: theme.radius.pill,
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
	panel: new Style<View>({
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: theme.radius.default,
		left: 16,
		paddingBottom: 10,
		paddingTop: 10,
		position: 'absolute' as const,
		right: 16,
		top: theme.headerHeight + 6,
		zIndex: 11,
	}),
};
