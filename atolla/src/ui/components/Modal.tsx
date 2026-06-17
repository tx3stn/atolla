import Strings from 'atolla/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { Button, ButtonType } from './Button';
import { CachedImage } from './CachedImage';
import { ModalBase, modalStyles } from './ModalBase';

export interface ModalViewModel {
	animationsEnabled?: boolean;
	body: string;
	cancelAccessibilityId?: string;
	cancelLabel?: string;
	confirmAccessibilityId?: string;
	confirmLabel?: string;
	logoUrl?: string;
	modalAccessibilityId?: string;
	onClose: () => void;
	onConfirm?: () => void;
	title: string;
}

export class Modal extends Component<ModalViewModel> {
	onRender(): void {
		const {
			animationsEnabled,
			body,
			cancelAccessibilityId,
			cancelLabel,
			confirmAccessibilityId,
			confirmLabel,
			logoUrl,
			modalAccessibilityId,
			onClose,
			onConfirm,
			title,
		} = this.viewModel;

		<ModalBase
			backdropAccessibilityId={modalAccessibilityId}
			cardStyle={styles.card}
			onDismiss={onClose}
		>
			{logoUrl && (
				<CachedImage category='artist_logo' objectFit='contain' style={styles.logo} url={logoUrl} />
			)}
			{!logoUrl && (
				<label numberOfLines={0} style={modalStyles.title} value={title.toUpperCase()} />
			)}
			<view style={modalStyles.divider} />
			<scroll style={styles.scroll}>
				<label numberOfLines={0} style={styles.body} value={body} />
			</scroll>
			{onConfirm && (
				<view>
					<view style={modalStyles.actions}>
						<view style={modalStyles.actionButton}>
							<Button
								accessibilityId={cancelAccessibilityId ?? ''}
								animationsEnabled={animationsEnabled}
								label={cancelLabel ?? Strings.cancel()}
								onTap={onClose}
								style={ButtonType.Secondary}
							/>
						</view>
						<view style={modalStyles.actionSeparator} />
						<view style={modalStyles.actionButton}>
							<Button
								accessibilityId={confirmAccessibilityId ?? ''}
								animationsEnabled={animationsEnabled}
								label={confirmLabel ?? Strings.yes()}
								onTap={onConfirm}
								style={ButtonType.Confirm}
							/>
						</view>
					</view>
				</view>
			)}
		</ModalBase>;
	}
}

const styles = {
	body: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
	}),
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		maxHeight: '80%',
		padding: 20,
		slowClipping: true,
		width: '90%',
	}),
	confirmDivider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 14,
		marginTop: 14,
		width: '100%',
	}),
	logo: new Style<ImageView>({
		height: 40,
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
		paddingBottom: 100,
	}),
};
