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
