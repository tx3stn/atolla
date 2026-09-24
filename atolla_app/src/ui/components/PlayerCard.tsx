import res from 'atolla_app/res';
import Strings from 'atolla_app/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Player } from '../../models/Player';
import { theme, withAlpha } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import type { ReorderableRowHandle } from './ReorderableList';
import { Toggle } from './Toggle';
import { TouchEventState } from './TouchEventState';

export interface PlayerCardViewModel {
	dragHandle?: ReorderableRowHandle;
	onLongPress?: () => void;
	onToggle: (enabled: boolean) => void;
	player: Player;
}

const TILE_SIZE = 72;
const ICON_SIZE = 34;
const DOT_SIZE = 8;
const HANDLE_SIZE = 24;
const STATUS_LINE_HEIGHT = 20;
const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_CANCEL_DISTANCE = 5;

const PLAYER_ICONS: Record<string, typeof res.players> = {
	speaker: res.players,
};

export class PlayerCard extends Component<PlayerCardViewModel> {
	private longPressTimeout: ReturnType<typeof setTimeout> | null = null;

	onDestroy(): void {
		this.cancelLongPress();
	}

	onRender(): void {
		const { dragHandle, onToggle, player } = this.viewModel;

		<view
			accessibilityId={`player-card-${player.id}`}
			accessibilityLabel={`player-card-${player.id}`}
			onTouch={this.viewModel.onLongPress ? this.handleCardTouch : undefined}
			style={styles.card}
		>
			<view style={styles.tile}>
				<image src={iconFor(player)} style={styles.icon} />
			</view>
			<layout style={styles.details}>
				<label numberOfLines={1} style={styles.name} value={player.name} />
				<layout style={styles.statusRow}>
					{player.enabled && (
						<view
							accessibilityId={`player-card-${player.id}-status-dot`}
							accessibilityLabel={`player-card-${player.id}-status-dot`}
							style={dotFor(player)}
						/>
					)}
					{player.enabled && (
						<label numberOfLines={2} style={statusStyleFor(player)} value={statusText(player)} />
					)}
				</layout>
				<label style={styles.meta} value={metaText(player)} />
			</layout>
			<layout style={styles.controls}>
				<Toggle
					accessibilityId={`player-card-${player.id}-toggle`}
					enabled={player.enabled}
					onToggle={onToggle}
				/>
				{dragHandle && (
					<view
						accessibilityId={`player-card-${player.id}-drag`}
						accessibilityLabel={`player-card-${player.id}-drag`}
						longPressDuration={dragHandle.longPressDuration}
						onLongPress={dragHandle.onLongPress}
						onLongPressDisabled={dragHandle.onLongPressDisabled}
						onTouch={this.handleDragHandleTouch}
						ref={dragHandle.ref}
						style={styles.handle}
					>
						<image
							src={res.draghandle}
							style={styles.handleIcon}
							tint={withAlpha(theme.colors.white, 0.45)}
						/>
					</view>
				)}
			</layout>
		</view>;
	}

	private cancelLongPress(): void {
		if (!this.longPressTimeout) {
			return;
		}
		clearTimeout(this.longPressTimeout);
		this.longPressTimeout = null;
	}

	private handleCardTouch = (event: TouchEvent): void => {
		if (event.state === TouchEventState.Started) {
			this.scheduleLongPress();
			return;
		}

		if (event.state === TouchEventState.Changed) {
			const drag = event as DragEvent;
			if (
				Math.abs(drag.deltaX) > LONG_PRESS_CANCEL_DISTANCE ||
				Math.abs(drag.deltaY) > LONG_PRESS_CANCEL_DISTANCE
			) {
				this.cancelLongPress();
			}
			return;
		}

		this.cancelLongPress();
	};

	// the drag handle lives inside the card, so its touches reach this component too; a press
	// arming a reorder must not also count towards the forget hold
	private handleDragHandleTouch = (event: TouchEvent): void => {
		this.cancelLongPress();
		this.viewModel.dragHandle?.onTouch(event);
	};

	private scheduleLongPress(): void {
		this.cancelLongPress();
		this.longPressTimeout = setTimeout(() => {
			this.longPressTimeout = null;
			hapticFeedback();
			this.viewModel.onLongPress?.();
		}, LONG_PRESS_DELAY_MS);
	}
}

function dotFor(player: Player): Style<View> {
	return isUnhealthy(player) ? styles.dotBad : styles.dotOn;
}

function dotStyle(backgroundColor: string): Style<View> {
	return new Style<View>({
		backgroundColor,
		borderRadius: theme.radius.pill,
		flexShrink: 0,
		height: theme.scale(DOT_SIZE),
		marginRight: theme.scale(6),
		width: theme.scale(DOT_SIZE),
	});
}

function iconFor(player: Player): typeof res.players {
	return (player.icon != null ? PLAYER_ICONS[player.icon] : undefined) ?? res.players;
}

function isUnhealthy(player: Player): boolean {
	return player.lastError != null || !player.reachable;
}

function metaText(player: Player): string {
	return player.isThisDevice ? Strings.playersThisDevice() : (player.address ?? '');
}

function statusStyle(color: string): Style<Label> {
	return new Style<Label>({
		...theme.text.sub,
		color,
		flexShrink: 1,
	});
}

function statusStyleFor(player: Player): Style<Label> {
	return isUnhealthy(player) ? styles.statusBad : styles.status;
}

function statusText(player: Player): string {
	if (player.lastError != null) {
		return player.lastError;
	}
	if (!player.reachable) {
		return Strings.playersStatusUnreachable();
	}
	return Strings.playersStatusConnected();
}

const styles = {
	card: new Style<View>({
		alignItems: 'stretch',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.radius.default,
		flexDirection: 'row',
		minHeight: theme.scale(100),
		padding: theme.scale(14),
		width: '100%',
	}),
	controls: new Style<Layout>({
		alignItems: 'flex-end',
		flexShrink: 0,
		justifyContent: 'space-between',
		marginLeft: theme.scale(10),
	}),
	details: new Style<Layout>({
		flexGrow: 1,
		flexShrink: 1,
		justifyContent: 'center',
		marginLeft: theme.scale(14),
	}),
	dotBad: dotStyle(theme.colors.destructive),
	dotOn: dotStyle(theme.colors.success),
	handle: new Style<View>({
		alignItems: 'center',
		justifyContent: 'center',
		paddingLeft: theme.scale(8),
		paddingTop: theme.scale(8),
	}),
	handleIcon: new Style<ImageView>({
		height: theme.scale(HANDLE_SIZE),
		width: theme.scale(HANDLE_SIZE),
	}),
	icon: new Style<ImageView>({
		height: theme.scale(ICON_SIZE),
		width: theme.scale(ICON_SIZE),
	}),
	meta: new Style<Label>({
		...theme.text.sub,
		marginTop: theme.scale(2),
	}),
	name: new Style<Label>({
		...theme.text.title,
		flexShrink: 1,
	}),
	status: statusStyle(theme.colors.muted),
	statusBad: statusStyle(theme.colors.destructive),
	statusRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		marginTop: theme.scale(6),
		minHeight: theme.scale(STATUS_LINE_HEIGHT),
		width: '100%',
	}),
	tile: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.default,
		flexShrink: 0,
		height: theme.scale(TILE_SIZE),
		justifyContent: 'center',
		slowClipping: true,
		width: theme.scale(TILE_SIZE),
	}),
};
