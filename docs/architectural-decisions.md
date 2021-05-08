# Architectural Decisions

## Why not a Hash to store all the entries of a Cache?
Redis Hash is the data structure to store key/value pair. But, we can't use it for the
cache purpose. Because, Redis Tracking works based on the key invalidation. Whenever any
entry in the hash is changed, Redis notifies that the Hash (as whole) is changed. With this it's
impossible to identify which particular CacheKey (Redis Hash Key) is changed.

## Redis TRACKING setup & Connections
Redis Connections used are as follows:
- 1 Connection per Cache
- 1 Connection to listen changes for the service caches
- 1 Connection to listen changes for the global caches

It sends following commands to enable Cache Entries Tracking.

```bash
# For Service Cache
CLIENT TRACKING on REDIRECT $serviceListenerClientId BCAST NOLOOP PREFIX $serviceName:$cacheName

# For Global Cache
CLIENT TRACKING on REDIRECT $globalListenerClientId BCAST NOLOOP PREFIX $cacheName
```

This command is sent from the Cache Connection to the Redis. And Redis sends notification
about the cache entry change/expiry on the corresponding Listener Connection.

On Re-connection, Tracking is first turned Off and then re-enabled. Because, mostly on the re-connection Listener Client's ID gets changed.
