// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';

export interface ModalViewModel {
	body: string;
	cancelAccessibilityLabel?: string;
	cancelLabel?: string;
	confirmAccessibilityLabel?: string;
	confirmLabel?: string;
	logoUrl?: string;
	modalAccessibilityLabel?: string;
	onClose: () => void;
	onConfirm?: () => void;
	title: string;
}

export class Modal extends Component<ModalViewModel> {
	onRender(): void {
		const {
			body,
			cancelAccessibilityLabel,
			cancelLabel,
			confirmAccessibilityLabel,
			confirmLabel,
			logoUrl,
			modalAccessibilityLabel,
			onClose,
			onConfirm,
			title,
		} = this.viewModel;
		const hasConfirmation = !!onConfirm;

		<blur
			accessibilityLabel={modalAccessibilityLabel}
			blurStyle='systemThickMaterialDark'
			onTap={onClose}
			style={styles.backdrop}
		>
			<view onTap={() => {}} style={styles.card}>
				{logoUrl && (
					<CachedImage
						category='artist_logo'
						objectFit='contain'
						style={styles.logo}
						url={logoUrl}
					/>
				)}
				{!logoUrl && <label style={styles.title} value={title.toUpperCase()} />}
				<view style={styles.divider} />
				<scroll style={styles.scroll}>
					<label numberOfLines={0} style={styles.body} value={body} />
				</scroll>
				{hasConfirmation && (
					<view>
						<view style={styles.confirmDivider} />
						<view style={styles.actions}>
							<view
								accessibilityLabel={confirmAccessibilityLabel}
								onTap={onConfirm}
								style={styles.actionButton}
							>
								<label style={styles.actionLabel} value={confirmLabel ?? 'yes'} />
							</view>
							<view style={styles.actionSeparator} />
							<view
								accessibilityLabel={cancelAccessibilityLabel}
								onTap={onClose}
								style={styles.actionButton}
							>
								<label style={styles.actionLabel} value={cancelLabel ?? 'no'} />
							</view>
						</view>
					</view>
				)}
			</view>
		</blur>;
	}
}

const styles = {
	actionButton: new Style({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	actionLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	actionSeparator: new Style({
		backgroundColor: theme.colors.separator,
		width: 1,
	}),
	actions: new Style({
		flexDirection: 'row',
	}),
	backdrop: new Style<BlurView>({
		alignItems: 'center',
		backgroundColor: theme.colors.overlay,
		bottom: 0,
		height: '100%',
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 100,
	}),
	body: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
		lineBreakMode: 'wordWrap',
	}),
	card: new Style({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		maxHeight: '80%',
		overflow: 'hidden',
		padding: 20,
		width: '90%',
	}),
	confirmDivider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 14,
		width: '100%',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 12,
		width: '100%',
	}),
	logo: new Style<ImageView>({
		height: 40,
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
	}),
	title: new Style<Label>({
		...theme.text.title,
	}),
};
