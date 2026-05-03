#!/bin/sh
TARGET=$(zig env | grep 'target' | sed 's/.*"\([^"]*\)".*/\1/' | cut -d'.' -f1)
zig test atolla/native/zig/atolla_algorithms.zig -target "$TARGET"
