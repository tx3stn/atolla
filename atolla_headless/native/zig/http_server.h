#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AtollaHttpServer AtollaHttpServer;

// Called on a connection thread for a request the server cannot answer itself. That thread stays
// blocked until atolla_http_respond carries the answer back, which is what keeps `target` and
// `body` alive. An implementation that answers later must copy them.
typedef void (*AtollaHttpDispatch)(void *context,
                                   uint64_t request_id,
                                   uint32_t route,
                                   const unsigned char *target,
                                   size_t target_len,
                                   const unsigned char *body,
                                   size_t body_len);

// Answers a dispatched request, from any thread. False if nothing is waiting for it any more,
// which is the normal outcome for an answer that arrives after its timeout.
bool atolla_http_respond(uint64_t request_id,
                         uint16_t status,
                         const unsigned char *body,
                         size_t len);

// The GET /hello body, copied. Set before starting the server: it is read by the connection
// threads without locking, on the understanding that nothing writes it again. False if too large.
bool atolla_http_set_hello_body(const unsigned char *bytes, size_t len);

// 0 debug, 1 info, 2 warn, 3 error, matching LOG_LEVELS. Anything else is ignored. The server
// writes its own lines, so a stalled JavaScript thread does not take the log with it.
void atolla_http_set_log_level(uint8_t level);

// Binds the given IPv4 host and port and serves on its own thread. Port 0 binds an ephemeral one,
// readable back with atolla_http_port. NULL if the host would not parse or the bind failed.
AtollaHttpServer *atolla_http_start(const unsigned char *host,
                                    size_t host_len,
                                    uint16_t port,
                                    AtollaHttpDispatch dispatch,
                                    void *context);

uint16_t atolla_http_port(AtollaHttpServer *server);

// Stops serving, waits for the connections in flight, and frees the server.
void atolla_http_stop(AtollaHttpServer *server);

#ifdef __cplusplus
}
#endif
