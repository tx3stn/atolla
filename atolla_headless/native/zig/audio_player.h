#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

bool atolla_audio_start(const char *device);
size_t atolla_audio_devices(unsigned char *out, size_t len);
bool atolla_audio_configure(const char *source, const char *track_id, const char *auth_header);
bool atolla_audio_configure_next(const char *source, const char *track_id, const char *auth_header);
void atolla_audio_clear_next(void);
void atolla_audio_set_playing(bool playing);
bool atolla_audio_seek_to_ms(int64_t position_ms);
int64_t atolla_audio_position_ms(void);
void atolla_audio_clear(void);
size_t atolla_audio_current_track_id(unsigned char *out, size_t len);
size_t atolla_audio_consume_event(unsigned char *out, size_t len);
bool atolla_audio_provide_clock(const char *bind_address, uint16_t port);
bool atolla_audio_follow_clock(const char *host, uint16_t port);
bool atolla_audio_clock_synced(void);
uint64_t atolla_audio_clock_now_ns(void);

#ifdef __cplusplus
}
#endif
