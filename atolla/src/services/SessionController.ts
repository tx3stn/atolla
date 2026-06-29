import type { ConnectionMode } from '../transports/Model';

export interface SessionHandle {
	applyDeviceIdOverride(value: string): void;
	defaultDeviceId(): string;
	logout(): void;
	requestModeChange(mode: ConnectionMode): Promise<boolean>;
	serverName(): string;
	serverUrl(): string;
}

/**
 * Bridges the auth/session actions the settings UI triggers but the shell owns. The shell registers
 * the implementations (which recreate the transport, stop playback, flip the authed/unauthed branch,
 * reload the device id, etc.); Settings and ViewHeader call the high-level methods without knowing
 * any of that. Mirrors the NavCoordinator register/forward pattern.
 */
export class SessionController {
	private handle?: SessionHandle;

	applyDeviceIdOverride(value: string): void {
		this.handle?.applyDeviceIdOverride(value);
	}

	defaultDeviceId(): string {
		return this.handle?.defaultDeviceId() ?? '';
	}

	logout(): void {
		this.handle?.logout();
	}

	register(handle: SessionHandle | null): void {
		this.handle = handle ?? undefined;
	}

	requestModeChange(mode: ConnectionMode): Promise<boolean> {
		return this.handle?.requestModeChange(mode) ?? Promise.resolve(false);
	}

	serverName(): string {
		return this.handle?.serverName() ?? '';
	}

	serverUrl(): string {
		return this.handle?.serverUrl() ?? '';
	}
}
