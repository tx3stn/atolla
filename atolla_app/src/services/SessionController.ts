import { type ConnectionMode, ConnectionModes } from '../models/App';

export interface SessionHandle {
	applyDeviceName(value: string): void;
	connectionMode(): ConnectionMode;
	defaultDeviceId(): string;
	defaultDeviceName(): string;
	expireSession(): void;
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

	applyDeviceName(value: string): void {
		this.handle?.applyDeviceName(value);
	}

	connectionMode(): ConnectionMode {
		return this.handle?.connectionMode() ?? ConnectionModes.offline;
	}

	defaultDeviceId(): string {
		return this.handle?.defaultDeviceId() ?? '';
	}

	defaultDeviceName(): string {
		return this.handle?.defaultDeviceName() ?? '';
	}

	expireSession(): void {
		this.handle?.expireSession();
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
