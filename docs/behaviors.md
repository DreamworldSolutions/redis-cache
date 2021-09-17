# Behaviors

## Cache Creation & Methods
- Cache is created only on the first invocation of the `cacheManager.getCache(name)` or `cacheManager.getGlobalCache(name)`.
- On the startup, in-memory cache is empty. It's populated based on the cache read & write operations.
- Cache Read operations: `get`, `mget`
  - It returns the value if it's available in the in-memory cache. Redis Lookup isn't done at all in this case.
  - If the value isn't available in the in-memory cache, then the Redis Lookup is done.
    - If the value is found from the redis, it's also stored into in-memory cache. So, future requests can be served from there.
    - If value isn't found from the redis either, cache lookup fails. No change in the in-memory cache. So, next lookup for the same key will again trigger the redis lookup; and hopefully at that time that entry might be available there.
- Cache Write Operations: `set`, `mset`
  - Value is written to both: in-memory & redis cache.
  - It does the blind write, so if the passed value is same as the current value then also cache entry is updated. So, It's TTL is counted from the last call. 
  - As it updates the Redis Entry, other instances gets notification for this change. So, they can refresh their entries. But, the instance which updated it doesn't receive the notification from the redis (which avoids the LOOP).
- Cache Entry delete: `del`
  - It deletes the requested entries from both cachees: in-memory & redis.
- `reset`:
  - In-memory cache is reset.
  - Only redis entries corresponding to this cache are cleanedup. It's ensure that it doesn't cleaup/empty your whole redis database.
- `keys`: Returns all the keys available on the redis, **corresponding to this cache only**.


## Auto refresh on redis notification


### Rule: No Loop
Scenario:
- Given 2 service instances: `user-1` and `user-2` are using a service cache.
- When `user-1` updates/deletes one of the cache entry in the service cache.
- Then `user-1` doesn't get notification for this redis key update. So, it doesn't need to do extra work of the refreshing in-memory cache key.
- But, `user-2` gets notification for this redis key update.


### Rule: updates in-memory cache key, only if already exists
When a Redis entry is updated corresponding to one of the live cache (being used by the app) entry; Then the cache entry is refreshed into in-memory cache, if in-memory cache holds that entry already. In case, in-memory cache hadn't that entry already; then it's not populated into in-memory.

#### Scenarios
- Redis Key updated for the cache, which isn't live in the app. => No op
- Redis Key updated for the live cache, but the entry exists in the in-memory cache. => No change in in-memory cahce; no new entry is populated in it.
- Redis Key updated for the live cache, and entry exists in the in-memory cache. => in-memory cache entry gets refreshed with the latest redis value.
- Redis Key deleted for the live cache, and entry exists in the in-memory cache. => in-memory cache entry gets deleted.


## Re-Connection
It handles the both of the following re-connection scenarios.
- Connection lost between the app & redis; and then re-established later on. e.g. Network link was broken
- Redis server is restarted


After the re-connection, cache read/write & cache refresh operations works as expected.