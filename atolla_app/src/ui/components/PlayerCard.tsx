import res from 'atolla_app/res';
import Strings from 'atolla_app/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Player } from '../../models/Player';
import { theme } from '../../theme';
import { Toggle } from './Toggle';

export interface PlayerCardViewModel {
	onToggle: (enabled: boolean) => void;
	player: Player;
}

const TILE_SIZE = 72;
const ICON_SIZE = 34;

const PLAYER_ICONS: Record<string, typeof res.players> = {
	speaker: res.players,
};

export class PlayerCard extends Component<PlayerCardViewModel> {
	onRender(): void {
		const { onToggle, player } = this.viewModel;

		<view
			accessibilityId={`player-card-${player.id}`}
			accessibilityLabel={`player-card-${player.id}`}
			style={styles.card}
		>
			<view style={styles.tile}>
				<image src={iconFor(player)} style={styles.icon} tint={healthColor(player)} />
			</view>
			<layout style={styles.details}>
				<layout style={styles.titleRow}>
					<label numberOfLines={1} style={styles.name} value={player.name} />
					<Toggle
						accessibilityId={`player-card-${player.id}-toggle`}
						enabled={player.enabled}
						onToggle={onToggle}
					/>
				</layout>
				<label numberOfLines={2} style={statusStyle(player)} value={statusText(player)} />
				<label style={styles.meta} value={metaText(player)} />
			</layout>
		</view>;
	}
}

function healthColor(player: Player): string {
	if (isUnhealthy(player)) {
		return theme.colors.destructive;
	}
	return player.enabled ? theme.colors.success : theme.colors.disabled;
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

function statusStyle(player: Player): Style<Label> {
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

const status = new Style<Label>({
	...theme.text.sub,
	marginTop: theme.scale(6),
});

const styles = {
	card: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.radius.default,
		flexDirection: 'row',
		minHeight: theme.scale(112),
		padding: theme.scale(14),
		width: '100%',
	}),
	details: new Style<Layout>({
		flexGrow: 1,
		flexShrink: 1,
		marginLeft: theme.scale(14),
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
		flexBasis: 0,
		flexGrow: 1,
		flexShrink: 1,
	}),
	status: status,
	statusBad: status.extend({ color: theme.colors.destructive }),
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
	titleRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		width: '100%',
	}),
};
