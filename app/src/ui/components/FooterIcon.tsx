// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface FooterIconView {
	accessibilityLabel?: string;
	action: () => void;
	active?: boolean;
	icon: unknown;
}

export class FooterIcon extends Component<FooterIconView> {
	onRender() {
		<view
			accessibilityLabel={this.viewModel.accessibilityLabel}
			onTap={this.viewModel.action}
			style={styles.footerTabChip}
		>
			<image
				src={this.viewModel.icon}
				style={styles.footerTabIconImage}
				tint={this.viewModel.active ? theme.colors.active : theme.colors.grey}
			/>
		</view>;
	}
}

const styles = {
	footerTabChip: new Style({
		alignItems: 'center',
		flex: 1,
		paddingBottom: 7,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: 5,
	}),
	footerTabIconImage: new Style<ImageView>({
		height: 17,
		width: 17,
	}),
};
