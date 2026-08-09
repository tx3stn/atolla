import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface FooterIconView {
	accessibilityId?: string;
	action: () => void;
	active?: boolean;
	activeColor?: string;
	badgeCount?: number;
	icon: string | Asset;
	inactiveColor?: string;
}

export class FooterIcon extends Component<FooterIconView> {
	onRender() {
		<view
			accessibilityId={this.viewModel.accessibilityId}
			accessibilityLabel={this.viewModel.accessibilityId}
			onTap={this.viewModel.action}
			style={styles.footerTabChip}
		>
			<image
				src={this.viewModel.icon}
				style={styles.footerTabIconImage}
				tint={
					this.viewModel.active
						? this.viewModel.activeColor
						: (this.viewModel.inactiveColor ?? theme.colors.grey)
				}
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
	badge: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.active,
		borderRadius: theme.radius.pill,
		justifyContent: 'center',
		minWidth: theme.scale(18),
		paddingBottom: theme.scale(2),
		paddingLeft: theme.scale(4),
		paddingRight: theme.scale(4),
		paddingTop: theme.scale(2),
		position: 'absolute',
		right: 20,
		top: 2,
	}),
	badgeLabel: new Style<Label>({
		...theme.text.sub,
		color: theme.colors.bg,
	}),
	footerTabChip: new Style<View>({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		padding: theme.scaleNav(4),
		paddingBottom: theme.scaleNav(8),
	}),
	footerTabIconImage: new Style<ImageView>({
		height: theme.scaleNav(26),
		width: theme.scaleNav(26),
	}),
};
