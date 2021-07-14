# redis-cache
2 Layered Cache (in-memory + redis) using https://redis.io/topics/client-side-caching

It's specifically designed for the micro-service architecture. In such setup, multiple instances of a service is deployed for horizontal scaling and cache should be shared between all the instances of a Service. At the same time, it shouldn't conflict with the caches of the other service in the cluster; because all the services stores their cache data on the same redis server.

It implements multi-layer cache using [node-cache-manager][node-cache-manager] and [node-cache-manager-redis-store][node-cache-manager-redis-store]. But, has following  additional features.
- Structured redis keys, based on the service name & cache name
- Realtime updates of the in-memory cache entries


Let's understand the features in detail.
### Structured redis keys
- Keys of service-specific cache is prefixed with `$serviceName:$cacheName:`.
- Keys of the global cache is prefixed with `$cacheName:`


### Realtime updates of the in-memory cache entries

As it's 2-layer of the Cache, all the data read from the redis are kept into in-memory cache. 
And on the sub-sequent request data is served from the in-memory cache (whenever available).
This greatly enhance the performance as redis call is avoided for the next requests, but it introduces an issue of stale data into the in-memory cache.

If you simply use the multi-layer cache as demonstrated in the  [node-cache-manager-redis-store guide][node-cache-manager-redis-store], you will encounter this issue. Conside the following scenario:

Given a User service's 2 instances are deployed: user-1 and user-2
When user-1 instance receives a request to read the detail of the `u1` user
Then `u1`'s data is cached into in-memory cache of `user-1` instance 
and `u1`'s data is also stored on the redis 
When user-2 instance receives the request to update the user detail of `u1` user
Then `u1`'s data is updated on the redis as well
When user-1 instance receives another request to read the same user `u1`
Then user-1 instance responds with the in-memory cache value; which is state, not the same as the latest updated by user-2 instance.


It solves this issue using a new `CLIENT TRACKING` command introduced in the redis 6.0. Read [Redis Guide](https://redis.io/topics/client-side-caching) to understand the redis-server feature & how a client should implement it.

Using this redis-server feature, in-memory cache-entries are automatically refreshed/deleted when they are updated on the redis (by another instance of the service).
## Getting Started
- Add NPM dependency
- Initialize
- Usage

### Add NPM dependency

```sh
npm install @dreamworld/redis-cache --save
```

or

```sh
yarn add @dreamworld/redis-cache
```
### Initialize

It uses [`node-config`][node-config] for the configuration. So, you can specify the configurations under `redisCache` module, in your application's configuration file.

An Example configuration file of your application.

```yaml
redisCache:
  serviceName: user
  redis:
    host: '127.0.0.1'
    port: 6379
    password: 'chirag1234'
  serviceCaches:
    cache1:
      ttl: 600
    cache2:
      ttl: 6000
      readOnly: true
  globalCaches:
    cache1:
      ttl: 600
      readOnly: true
    cache2:
      ttl: 600
    cache3:
      ttl: 600
```

- `serviceCaches` and `globalCaches` are optional configurations. Specify them when you want
  to either set the default `ttl` for your cache OR make it as the `readOnly` cache.
- **Environment Variables** `SERVICE_NAME`, `REDIST_HOST`, `REDIS_PORT` and `REDIS_PASSWORD` can also be used to set the configuration.
### Usage

```javascript
import { cacheManager } from '@dreamworld/redis-cache';

//Retrieve the Service Cache
let cache = cacheManager.getCache('cache-name');

//OR Retrieve the Global cache
let globalCache = cacheManager.getGlobalCache('cache-name');


//Here, the `cache` and `globalCache` are `caching` instance of the `node-cache-manager`. 
//So, you can use `get`, `set`, `del`, `wrap` etc. methods as per it's usage pattern.

//Few example usage:
await cache.set('key1', 'val1');
await cache.set('key1', 'val1', 600); //with ttl as the 3rd argument
await cache.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3', {ttl: 600});


let val1 = await cache.get('key1');
let vals = await cache.mget('key1', 'key2', 'key3'); //vals =  ['val1', null, 'val3'];
//Note: mget doesn't support array of keys as a single argument.

await cache.del('key1');
await cache.del('key1', 'key2');
await cache.del(['key1', 'key2']);

await cache.reset(); //To delete all the cache entries

const getUser = async (id) => {
  //Actual logic to read user by it's id.
  //Promise is resolved the User object once retrieved.
};
const getCachedUser = async (userId) => memoryCache.wrap(userId, () => getUser(userId));


//You can access underlying memory or redis Store as follows. You mostly don't need to
//use them directly. Though, it's exposed as an advanced use-case.
let memoryStore = cache.memory;
let redisStore = cache.redis;
```

Please note that,
- Cache configurations should be provided only for the default value purpose. If you don't want to set any default TTL (and want to keep cache entry forever) then you may skip providing the cache configuration.
- If you invoke the `getCache()` again for the same cache name, then the same cache reference
is returned. So, you can retrieve the cache instance wherever needed using this method.

### Read-only Cache

```javascript
cache = cacheManager.getGlobalCache('cache1');
cache.wrap('key1', ()=>{
  //task
});
```

In cache config, if you set `readOnly=true` then the cache becomes readonly. In the example config we have set global cache `cache1` as read-only. So, It will read the value from the cache & returns it if exists. Otherwise, invokes the task to find the value. But, after the task is completed, the return value isn't put back into cache.

Further readings:
- [Detailed Behaviors](./docs/behaviors.md)
- [Architectural Decisions](./docs/architectural-decisions.md)


[node-config]: https://www.npmjs.com/package/config
[node-cache-manager]: https://github.com/BryanDonovan/node-cache-manager
[node-cache-manager-redis-store]: https://github.com/dabroek/node-cache-manager-redis-store
