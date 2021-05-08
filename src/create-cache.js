import cacheManager from 'cache-manager';
import redisStore from 'cache-manager-redis-store';
import log4js from 'log4js';

const logger = log4js.getLogger('dreamworld.redis-cache.cache-manager');

/**
 * It overrides `get` method of the cache to resolve a bug in the multi-cache's `get`.
 * multi-cache's `get` returns the value from the redis cache when it doesn't exist into
 * in-memory, but after that the newly read value isn't put into the in-memory cache.
 * 
 * @param {caching} cache 
 */
const overrideGet = (cache) => {
  let _get = cache.get.bind(cache);
  cache.get = (async (...args) => {
    let val = await _get.apply(this, args);
    if (val !== undefined || val !== null) {
      cache.memory.set(args[0], val);
    } else {
      cache.memory.del(key);
    }
    return val;
  }).bind(cache);
}

const overrideMGet = (cache) => {
  let _mget = cache.mget.bind(cache);
  cache.mget = (async (...args) => {
    let vals = await _mget.apply(this, args);
    args.forEach((key, index) => {
      let val = vals[index];
      if (val !== undefined || val !== null) {
        cache.memory.set(key, val);
      } else {
        cache.memory.del(key);
      }
    });
    return vals;
  }).bind(cache);
}

/**
 * Adds a `refresh(key)` and `refreshAll()` methods to the cache. 
 * On `refresh` the in-memory value of that cache-entry is updated/refreshed with the redis
 * cache value.
 * @param {caching} cache 
 */
const addRefresh = (cache) => {
  cache.refresh = async (keys) => {
    if (typeof keys === 'string') {
      keys = [keys];
    }

    let values = await cache.memory.mget.apply(cache.memory, keys);
    keys = keys.filter((key, index) => {
      const value = values[index];
      if (value === null || value === undefined) {
        logger.trace(`refresh: CacheEntry doesn't exist. prefix=${cache.prefix}, key=${key}`);
        return false;
      }
      return true;
    });

    logger.trace('refresh: going to refresh. keys=', keys);
    if (keys.length === 0) {
      return keys;
    }

    await cache.memory.del(keys);
    await cache.mget.apply(cache, keys);
    logger.trace(`refresh: done. prefix=${cache.prefix}, keys=${keys}`);
    return keys;
  }

  cache.refreshAll = async () => {
    let keys = await cache.memory.keys();
    logger.debug('keys', keys);
    if (keys.length !== 0) {
      await cache.memory.reset();
      await cache.mget.apply(cache, keys);
    }
    logger.trace(`refreshAll: done. prefix=${cache.prefix}, noOfKeys=${keys.length}`);
    return keys.length;
  }
}

const overrideKeys = (cache, prefix) => {
  const _keys = cache.keys;
  cache.keys = async (pattern = "*") => {
    pattern = prefix + pattern;
    let keys = await _keys.apply(cache, [pattern]);
    return keys.map((key) => key.substr(prefix.length));
  }
}

const overrideReset = (cache) => {
  cache.reset = async () => {
    let keys = await cache.keys();
    if(keys.length === 0) {
      return;
    }
    await cache.del(keys);
  }
}

export default (redisOptions, prefix, ttl, readOnly = false) => {
  let redisCache = cacheManager.caching({ store: redisStore, ...redisOptions, prefix, ttl: ttl });
  overrideKeys(redisCache, prefix);
  overrideReset(redisCache);


  let memoryCache = cacheManager.caching({ store: 'memory', ttl: ttl });
  let multiCacheOptions = !readOnly ? {} : {
    isCacheableValue: () => false
  };
  let multiCache = cacheManager.multiCaching([memoryCache, redisCache], multiCacheOptions);
  multiCache.memory = memoryCache;
  multiCache.redis = redisCache;
  multiCache.prefix = prefix;
  overrideGet(multiCache);
  overrideMGet(multiCache);
  addRefresh(multiCache);
  return multiCache;
}