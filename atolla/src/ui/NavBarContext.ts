import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { FooterTab, HeaderTab } from '../models/App';
import type { BarColorStore } from '../stores/BarColor';
import type { ConnectionMode } from '../transports/Model';

export interface NavBarHeaderContext {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	onAlphabetLetterTap?: (letter: string | null) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onTabTap: (tab: HeaderTab) => void;
}

export interface NavBarContext {
	activeFooterTab: FooterTab;
	barColors: BarColorStore;
	downloadingCount: number;
	header?: NavBarHeaderContext;
	modalSlot?: DetachedSlot;
	nowPlayingOverlaySlot?: DetachedSlot;
	onFooterTabTap: (tab: FooterTab) => void;
}
