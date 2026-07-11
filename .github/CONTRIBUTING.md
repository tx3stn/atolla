# Contributing to `atolla`

## Follow the guidelines

Humans and AI agents should follow the guidelines outlined in [AGENTS.md](../AGENTS.md).

AI contributions will be considered as long as they follow the guidelines and
you can explain how they work and why they have been implemented the way they have.

## What to contribute

Make sure you read the [Why? section in the README](/README.md#why). If you're
trying to add something that isn't a good fit for the app it may get rejected.

To avoid spending any time on something that isn't a good fit, first raise your
idea as a feature request. You might be asked for more detail or clarifying
questions to help explain the extent or scope of feature. Once the scope and
design is agreed a label `feature-ready` will be added to the issue.

Want to claim a feature request to work on? Stick a comment on there saying
you'd like to tackle that one. Avoid picking up anything someone else has
already claimed unless it's been a while and they haven't raised a pull request
for it yet, or their pull request has gone stale waiting for changes.

## Keep all tests and checks passing

Before pushing up your changes make sure you run `bun run check:full` to keep
all the tests passing to make sure everything still works.
This includes end to end tests so will take about 10 minutes to build and test
everything.

## Palette generation tweaks

The player colors are dynamically generated, so if you find a cover that doesn't
work right, or becomes illegible you can test changes to the color extraction
logic that lives in [atolla/native/zig/palette_extractor.zig](../atolla/native/zig/palette_extractor.zig)
with the `palette-preview` tool.

1. Downlaod the album art from your Jellyfin server.
2. Save the downloaded file to `tools/palette-preview/samples/`. I'd recommend you
incllude serveral files here so you can check how your change impacts a variety
of artwork, not just the one you are trying to fix.
3. Run the preview tool:

```bash
bun run palette:preview
```

Open the generated image file to review the impact of the change.

Include a link to the artwork you used to test the changes in your pull request,
so that it can be tested along side the sample set used to tune the colors.
