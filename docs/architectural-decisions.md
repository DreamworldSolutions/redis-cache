# Architectural Decisions

## Why not a Hash to store all the entries of a Cache?

## BROADCAST mode of TRACKING

## Why `getGlobalCache` fails if cache isn't declared?


## Redis Connections
- 1 Connection per Cache
- 1 Connection to listen changes for the service caches
- 1 Connection to listen changes for the global caches