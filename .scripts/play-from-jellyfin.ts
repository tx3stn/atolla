// Provisions a running daemon with a real Jellyfin credential over QuickConnect, then plays a real
// track through it. Everything goes through the daemon's own HTTP surface, so this drives what a
// controller drives and adds no back door to the CLI.
//
// Playing proves the streaming path works. It does not prove the Authorization header arrived:
// `/Audio/{id}/stream` is [AllowAnonymous] on Jellyfin, which is the bug the header exists for.
// The server log is where you see which account the stream was attributed to.

import { version } from '../atolla_core/src/version';

const QUICK_CONNECT_POLL_MS = 2_000;
const QUICK_CONNECT_TIMEOUT_MS = 120_000;
const PLAY_WATCH_MS = 10_000;
const PLAY_POLL_MS = 500;

interface Args {
	code: string;
	player: string;
	server: string;
	session: Session | undefined;
	track: string | undefined;
	trackDuration: number;
	trackName: string;
}

interface Hello {
	id: string;
	name: string;
}

interface Session {
	accessToken: string;
	serverId: string;
	userId: string;
}

function usage(): never {
	console.error(`usage: bun .scripts/play-from-jellyfin.ts --server <url> --code <pairing code> [options]

  --server <url>        the Jellyfin base url, e.g. http://jellyfin.local:8096
  --code <code>         the daemon's pairing code, from \`atolla pair\` (spaces are fine)
  --player <url>        the daemon's control url (default http://127.0.0.1:45889)
  --track <id>          a Jellyfin item id to queue and play; omit to only provision
  --track-name <name>   what to call it in the queue (default "manual test")
  --track-duration <s>  its length in seconds (default 180)

The first run asks you to approve a QuickConnect code, then prints the session it got. Pass those
three back to skip the approval next time:

  --token <accessToken> --user <userId> --server-id <serverId>

Run \`atolla pair\` for a code and \`atolla run\` in another shell first.`);
	process.exit(1);
}

function parseArgs(argv: Array<string>): Args {
	const values = new Map<string, string>();

	for (let index = 0; index < argv.length; index += 2) {
		const flag = argv[index];
		const value = argv[index + 1];
		if (!flag.startsWith('--') || value === undefined) {
			usage();
		}
		values.set(flag.slice(2), value);
	}

	const code = values.get('code')?.replace(/\s+/g, '');
	const server = values.get('server');
	if (code === undefined || server === undefined) {
		usage();
	}

	const accessToken = values.get('token');
	const serverId = values.get('server-id');
	const userId = values.get('user');
	const reused = [accessToken, serverId, userId].filter((value) => value !== undefined);
	if (reused.length > 0 && reused.length < 3) {
		usage();
	}

	return {
		code,
		player: (values.get('player') ?? 'http://127.0.0.1:45889').replace(/\/+$/, ''),
		server: server.replace(/\/+$/, ''),
		session:
			accessToken === undefined || serverId === undefined || userId === undefined
				? undefined
				: { accessToken, serverId, userId },
		track: values.get('track'),
		trackDuration: Number(values.get('track-duration') ?? '180'),
		trackName: values.get('track-name') ?? 'manual test',
	};
}

async function json<T>(response: Response, what: string): Promise<T> {
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`${what}: HTTP ${response.status} ${body}`);
	}

	return JSON.parse(body) as T;
}

// Jellyfin binds the minted token to whatever device this names, so the speaker shows in its device
// list as the room. The account is unknown until the token exists, so this cannot be the per-account
// `atolla-<playerId>-<userId>` form the schema documents.
function mediaBrowserHeader(hello: Hello): string {
	return `MediaBrowser Client="atolla-headless", Device="${hello.name}", DeviceId="${deviceId(hello)}", Version="${version}"`;
}

function deviceId(hello: Hello): string {
	return `atolla-${hello.id}-manual`;
}

async function quickConnect(server: string, hello: Hello): Promise<Session> {
	const headers = { Authorization: mediaBrowserHeader(hello) };

	const enabled = await json<boolean>(
		await fetch(`${server}/QuickConnect/Enabled`, { headers }),
		'asking whether QuickConnect is enabled',
	);
	if (!enabled) {
		throw new Error('QuickConnect is turned off on this server, so there is no code to approve');
	}

	const initiated = await json<{ Code: string; Secret: string }>(
		await fetch(`${server}/QuickConnect/Initiate`, { headers, method: 'POST' }),
		'starting QuickConnect',
	);

	console.log(`\n  approve this code in Jellyfin: ${initiated.Code}\n`);
	console.log(`  (your profile menu → Quick Connect, at ${server})\n`);

	const deadline = Date.now() + QUICK_CONNECT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const state = await json<{ Authenticated?: boolean }>(
			await fetch(`${server}/QuickConnect/Connect?secret=${encodeURIComponent(initiated.Secret)}`, {
				headers,
			}),
			'waiting for approval',
		);

		if (state.Authenticated) {
			const authenticated = await json<{
				AccessToken: string;
				ServerId: string;
				User: { Id: string };
			}>(
				await fetch(`${server}/Users/AuthenticateWithQuickConnect`, {
					body: JSON.stringify({ Secret: initiated.Secret }),
					headers: { ...headers, 'Content-Type': 'application/json' },
					method: 'POST',
				}),
				'exchanging the approved secret for a token',
			);

			return {
				accessToken: authenticated.AccessToken,
				serverId: authenticated.ServerId,
				userId: authenticated.User.Id,
			};
		}

		await new Promise((resolve) => setTimeout(resolve, QUICK_CONNECT_POLL_MS));
	}

	throw new Error('nobody approved the code in time');
}

async function command(args: Args, token: string, body: unknown): Promise<void> {
	const response = await fetch(`${args.player}/command`, {
		body: JSON.stringify(body),
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`command ${JSON.stringify(body)}: HTTP ${response.status}`);
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	const hello = await json<Hello>(await fetch(`${args.player}/hello`), 'reaching the daemon');
	console.log(`daemon: ${hello.name} (${hello.id}) at ${args.player}`);

	const session = args.session ?? (await quickConnect(args.server, hello));
	console.log(`jellyfin: authenticated as ${session.userId} on server ${session.serverId}`);

	if (args.session === undefined) {
		console.log(
			`\nskip the approval next run with:\n  --token ${session.accessToken} --user ${session.userId} --server-id ${session.serverId}\n`,
		);
	}

	const paired = await json<{ token: string }>(
		await fetch(`${args.player}/pair`, {
			body: JSON.stringify({
				code: args.code,
				controllerId: 'manual-test',
				controllerName: 'manual test',
			}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		}),
		'pairing with the daemon',
	);

	// 200 stored, 422 the token is dead or not that account's, 409 a different server, 503 the
	// daemon could not reach Jellyfin to ask.
	const pushed = await fetch(`${args.player}/media-server`, {
		body: JSON.stringify({
			accessToken: session.accessToken,
			baseUrl: args.server,
			deviceId: deviceId(hello),
			serverId: session.serverId,
			userId: session.userId,
		}),
		headers: { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' },
		method: 'PUT',
	});

	console.log(`push: HTTP ${pushed.status} ${await pushed.text()}`);
	if (!pushed.ok) {
		process.exit(1);
	}

	const provisioned = await json<{ sourceHealth?: { mediaServerUsers?: Array<string> } }>(
		await fetch(`${args.player}/state`, {
			headers: { Authorization: `Bearer ${paired.token}` },
		}),
		'reading the daemon state',
	);
	console.log(`provisioned accounts: ${provisioned.sourceHealth?.mediaServerUsers?.join(', ')}`);

	if (args.track === undefined) {
		console.log('\nno --track given, so nothing was played');
		return;
	}

	await command(args, paired.token, {
		command: 'setQueue',
		trackIndex: 0,
		tracks: [{ duration: args.trackDuration, id: args.track, name: args.trackName }],
		userId: session.userId,
	});
	await command(args, paired.token, { command: 'play' });

	const deadline = Date.now() + PLAY_WATCH_MS;
	while (Date.now() < deadline) {
		const state = await json<{ playback: { isPlaying: boolean; positionMs: number } }>(
			await fetch(`${args.player}/state`, {
				headers: { Authorization: `Bearer ${paired.token}` },
			}),
			'reading the daemon state',
		);

		if (state.playback.positionMs > 0) {
			console.log(`\nplaying: position ${state.playback.positionMs}ms`);
			console.log('check the Jellyfin log to see which account the stream was attributed to');
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, PLAY_POLL_MS));
	}

	console.log('\nthe position never moved — the daemon output says why');
	process.exit(1);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
