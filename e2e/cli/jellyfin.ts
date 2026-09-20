// Only `/Users/Me`, which is all the daemon asks a media server before it will hold a credential.
// Browsing a library is `tools/mock-server`'s job; this has to run on a bare CI runner and inside
// the linux test image, where Docker is not reachable.
export interface FakeJellyfin {
	authorizations: Array<string>;
	baseUrl: string;
	// The same server under another name, for the push that spells its address differently.
	otherBaseUrl: string;
	stop: () => Promise<void>;
	tokenFor: (userId: string) => string;
}

export function startJellyfin(userIds: Array<string>): FakeJellyfin {
	const tokenFor = (userId: string) => `token-for-${userId}`;
	const accounts = new Map(userIds.map((userId) => [tokenFor(userId), userId]));
	const authorizations: Array<string> = [];

	const server = Bun.serve({
		fetch: (request) => {
			if (new URL(request.url).pathname !== '/Users/Me') {
				return new Response(null, { status: 404 });
			}

			const authorization = request.headers.get('Authorization') ?? '';
			authorizations.push(authorization);

			const userId = accounts.get(bearerToken(authorization));
			if (userId === undefined) {
				return new Response(null, { status: 401 });
			}

			return Response.json({ Id: userId, Name: `account ${userId}` });
		},
		hostname: '127.0.0.1',
		port: 0,
	});

	// The unreachable-server test stops it, then the teardown stops it again.
	let running = true;

	return {
		authorizations,
		baseUrl: `http://127.0.0.1:${server.port}`,
		otherBaseUrl: `http://localhost:${server.port}`,
		stop: async () => {
			if (running) {
				running = false;
				await server.stop(true);
			}
		},
		tokenFor,
	};
}

function bearerToken(authorization: string): string {
	return authorization.match(/Token="([^"]*)"/)?.[1] ?? '';
}
