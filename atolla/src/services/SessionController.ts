import { type ConnectionMode, ConnectionModes } from '../transports/Model';

export interface SessionHandle {
	applyDeviceIdOverride(value: string): void;
	connectionMode(): ConnectionMode;
	defaultDeviceId(): string;
	logout(): void;
	requestModeChange(mode: ConnectionMode): Promise<boolean>;
	serverName(): string;
	serverUrl(): string;
}

// bridges the auth/session actions the settings UI triggers but the shell owns. shell registers
// the implementations (which recreate the transport, stop playback, flip the authed/unauthed branch,
// reload the device id, etc).
export class SessionController {
	private handle?: SessionHandle;

	applyDeviceIdOverride(value: string): void {
		this.handle?.applyDeviceIdOverride(value);
	}

	connectionMode(): ConnectionMode {
		return this.handle?.connectionMode() ?? ConnectionModes.offline;
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
