#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AtollaHttpServer AtollaHttpServer;

// The GET /hello body, copied. Set before starting the server: it is read by the connection
// threads without locking, on the understanding that nothing writes it again. False if too large.
bool atolla_http_set_hello_body(const unsigned char *bytes, size_t len);

// Binds 0.0.0.0 on the given port and serves on its own thread. Port 0 binds an
// ephemeral one, readable back with atolla_http_port. NULL if the bind failed.
AtollaHttpServer *atolla_http_start(uint16_t port);

uint16_t atolla_http_port(AtollaHttpServer *server);

// Stops serving, waits for the connections in flight, and frees the server.
void atolla_http_stop(AtollaHttpServer *server);

#ifdef __cplusplus
}
#endif
