#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AtollaHttpServer AtollaHttpServer;

// Binds 0.0.0.0 on the given port and serves on its own thread. Port 0 binds an
// ephemeral one, readable back with atolla_http_port. NULL if the bind failed.
AtollaHttpServer *atolla_http_start(uint16_t port);

uint16_t atolla_http_port(AtollaHttpServer *server);

// Stops serving, waits for the connections in flight, and frees the server.
void atolla_http_stop(AtollaHttpServer *server);

#ifdef __cplusplus
}
#endif
