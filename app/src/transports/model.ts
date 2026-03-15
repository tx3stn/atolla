export const ConnectionModes = {
	mock: 'mock',
	offline: 'offline',
	online: 'online',
};

export type ConnectionMode = (typeof ConnectionModes)[keyof typeof ConnectionModes];

export function cycleConnectionMode(current: ConnectionMode): ConnectionMode {
	switch (current) {
		case ConnectionModes.mock: {
			return ConnectionModes.online;
		}

		case ConnectionModes.online: {
			return ConnectionModes.offline;
		}

		default: {
			return ConnectionModes.mock;
		}
	}
}
