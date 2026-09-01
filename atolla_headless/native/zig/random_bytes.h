#pragma once
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

bool atolla_random_bytes(unsigned char *out, size_t len);

#ifdef __cplusplus
}
#endif
