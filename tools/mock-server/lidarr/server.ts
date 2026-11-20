const PORT = Number(process.env.MOCK_LIDARR_PORT ?? 8686);

function inAWeek(): string {
	const release = new Date();
	release.setUTCDate(release.getUTCDate() + 7);
	return `${release.toISOString().slice(0, 10)}T00:00:00Z`;
}

function upcomingAlbums(): Array<unknown> {
	return [
		{
			artist: { artistName: 'Converge' },
			id: 1,
			images: [],
			releaseDate: inAWeek(),
			title: 'Axe to Fall',
		},
	];
}

Bun.serve({
	fetch(req) {
		if (!req.headers.get('x-api-key')) {
			return new Response(null, { status: 401 });
		}

		const url = new URL(req.url);
		if (url.pathname === '/api/v1/system/status') {
			return Response.json({ appName: 'Lidarr', version: '2.0.0' });
		}
		if (url.pathname === '/api/v1/calendar') {
			return Response.json(upcomingAlbums());
		}

		return new Response('no lidarr fixture for this path', { status: 404 });
	},
	port: PORT,
});

console.log(`lidarr on http://localhost:${PORT}`);
