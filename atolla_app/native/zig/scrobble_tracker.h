#pragma once
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Shared scrobble "played?" decision (see scrobble_tracker.zig). Stateless: the native audio
// engine calls it at the discrete points a track ends or is left. A natural end always counts;
// otherwise the track counts only when the leave position reached threshold_ratio of the duration.
bool atolla_scrobble_should_count(
    int64_t position_ms,
    int64_t duration_ms,
    float threshold_ratio,
    bool is_natural_end
);

#ifdef __cplusplus
}
#endif
