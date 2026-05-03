import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ConnectionMode } from '../transports/Model';
import type { FooterTab } from './components/FooterTab';
import type { HeaderTab } from './components/HeaderTabs';
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
	downloadingCount: number;
	header?: NavBarHeaderContext;
	modalSlot?: DetachedSlot;
	nowPlayingOverlaySlot?: DetachedSlot;
	onFooterTabTap: (tab: FooterTab) => void;
}
