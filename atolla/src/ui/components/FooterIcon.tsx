// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface FooterIconView {
	accessibilityLabel?: string;
	action: () => void;
	active?: boolean;
	badgeCount?: number;
	icon: unknown;
}

export class FooterIcon extends Component<FooterIconView> {
	onRender() {
		<view
			accessibilityLabel={this.viewModel.accessibilityLabel}
			contentDescription={this.viewModel.accessibilityLabel}
			onTap={this.viewModel.action}
			style={styles.footerTabChip}
		>
			<image
				src={this.viewModel.icon}
				style={styles.footerTabIconImage}
				tint={this.viewModel.active ? undefined : theme.colors.grey}
			/>
			{(this.viewModel.badgeCount ?? 0) > 0 && (
				<view style={styles.badge}>
					<label style={styles.badgeLabel} value={String(this.viewModel.badgeCount)} />
				</view>
			)}
		</view>;
	}
}

const styles = {
	badge: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: 999,
		justifyContent: 'center',
		minWidth: 18,
		paddingBottom: 2,
		paddingLeft: 4,
		paddingRight: 4,
		paddingTop: 2,
		position: 'absolute',
		right: 20,
		top: 2,
	}),
	badgeLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.white,
	}),
	footerTabChip: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingBottom: 10,
		paddingLeft: 0,
		paddingRight: 0,
		paddingTop: 5,
	}),
	footerTabIconImage: new Style<ImageView>({
		height: 25,
		width: 25,
	}),
};
