# atolla mock server

An external Jellyfin-shaped mock the app connects to like a real server.
It runs [pb33f/wiretap](https://pb33f.io/wiretap/) over a
generated static-mock tree, validated against the real Jellyfin OpenAPI spec, and
proxies media requests to our own handler.

## Run it

```sh
bun run mock:serve
```

Then in the app's connection screen enter:

- android emulator: `http://10.0.2.2:9090`
- iOS simulator: `http://localhost:9090`

## How it works

- **`generate.ts`** imports the typed fixtures and emits one wiretap static-mock
 definition per endpoint the app's `LiveTransport` calls.
- wiretap matches on the subset of query params each fixture pins and prefers the
  **most specific** match, which disambiguates the many endpoints that share `/Items`.
- Responses return the full result set with `TotalRecordCount = length`, so `hasMore`
  is always false and the app never needs a second page.
- **`media-server.ts`** serves `/Audio/{id}/stream.mp3` and `/Items/{id}/Images/{type}`
  from `./media/` with HTTP Range support. Add `media/audio/<trackId>.mp3` and
  `media/images/<id>.jpg` (or a `default.*` fallback per folder).

## Editing the data

`generated/` is **derived output — never edit it by hand.** Change the typed fixtures
in `tools/mock-server/mocks/` and re-run `bun run mock:generate` (or just `mock:serve`).

## Not yet covered

- `getAlbumsByIds` (combinatorial `ids=` sets)
- `search` (free-text `searchTerm=`)
- A–Z letter filter (`nameStartsWith` / `nameLessThan`)
