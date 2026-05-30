# atolla development guidelines

This project uses Valdi, Typescript, biome.js (for linting/formatting) and webdriver.io for end to end tests.

## Approach

* test driven development using red green refactor approach
* create unit tests for all new functionality
* errors should use the error constants defined in `atolla/src/errors`, so packages can define consistent errors, and tests can verify the correct error is thrown
* components should be kept simple
* use dependency injection to pass stores/services to components so they are easy to test and logic is kept simple
* styling should ALWAYS use the theme so things can be easily tweaked

## Tests

Unit tests should live next to the files they are testing and are written with bun. Run with `bun run test`

Component tests are required when the thing being tested imports valdi as these need to be run with bazel. They are written with jasmine & valid and live in `atolla/test`. Run with `bun run test:components`

@.ai/e2e-tests.md

Native code should always be tested too, and will need to be run via bazel.

Zig tests can be run with `bun run test:zig`.
Kotlin tests can be run with `bun run test:android`.

## Commands

Commands are defined in @package.json and run with `bun run ...`

* `bun run check` should be run after changes to make sure they work.
* `bun run check:full` runs all checks but the end to end tests might be too slow for your requirements.

## App

Is built with typescript and valdi.
@.ai/valdi.md

Native things that need to run cross platform are written in zig, to ensure they behave the same consistently.
