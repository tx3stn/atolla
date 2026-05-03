export const ConnectionModes = {
	mock: 'mock',
	offline: 'offline',
	online: 'online',
} as const;

export type ConnectionMode = (typeof ConnectionModes)[keyof typeof ConnectionModes];

export function cycleConnectionMode(current: ConnectionMode): ConnectionMode {
	switch (current) {
		// mock mode is not cycleable
		case ConnectionModes.mock: {
			return ConnectionModes.mock;
		}

		case ConnectionModes.offline: {
			return ConnectionModes.online;
		}

		case ConnectionModes.online: {
			return ConnectionModes.offline;
		}

		default: {
			return ConnectionModes.online;
		}
	}
}
