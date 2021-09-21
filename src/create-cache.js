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
  let _get = cache.get;
  cache.get = (async (...args) => {
    logger.trace('get():', args);
    let val = await _get.apply(this, args);
    if (val !== undefined || val !== null) {
      cache.memory.set(args[0], val);
    } else {
      cache.memory.del(key);
    }
    logger.trace(`get(${args[0]})=${val}`);
    return val;
  }).bind(cache);
}

const overrideMGet = (cache) => {
  let _mget = cache.mget;
  cache.mget = (async (...args) => {
    logger.trace('mget:', args);
    let vals = await _mget.apply(this, args);

    //default implementation of `mget` function has a bug; When it's
    //asked for the single key, it returns plain-value (instead of 
    //wrapping it in an Array). So, this is needed.
    vals = args.length === 1 ? [vals] : vals;

    logger.trace(`mget:`, vals);
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
    await cache.mget(...keys);
    logger.trace(`refresh: done. prefix=${cache.prefix}, keys=${keys}`);
    return keys;
  }

  cache.refreshAll = async () => {
    let keys = await cache.memory.keys();
    logger.trace('refreshAll: keys=', keys);
    if (keys.length !== 0) {
      await cache.memory.reset();
      await cache.mget.apply(cache, keys);
    }
    logger.trace(`refreshAll: done. prefix=${cache.prefix}, noOfKeys=${keys.length}`);
    return keys.length;
  }
}

const overrideKeys = (cache, prefix) => {
  const _keys = cache.store.keys;
  cache.store.keys = async (pattern = "*", cb) => {
    if (typeof pattern === 'function') {
      cb = pattern;
      pattern = '*';
    }
    logger.trace(`keys: invoked. prefix=${prefix}, pattern=${pattern}`);
    pattern = prefix + pattern;
    let keys = await _keys.apply(cache.store, [pattern]);
    keys = keys.map((key) => key.substr(prefix.length));
    if (cb) {
      cb(keys);
    }
    return keys;
  }

  cache.keys = cache.store.keys.bind(cache.store);
}

/**
 * Overrides reset function of the redisCache.
 * @param {*} cache 
 */
const overrideReset = (cache) => {
  // console.log('overrideReset invoked:', cache);
  cache.store.reset = async (next) => {
    // console.log('overrideReset:  invoked');
    let keys = await cache.keys();
    // console.log('overrideReset: keys=', keys);
    if (keys.length === 0) {
      next();
      return;
    }

    await cache.del(keys);
    if (next) {
      next();
    }
  }

  cache.reset = cache.store.reset.bind(cache.store);
}

/**
 * Overrides reset funtion of the multi-caching.
 * Default implementation of the reset function has a bug. It doesn't return
 * Promise, and our usage pattern needs a promise. So, this updates implementation
 * to add Promise interface to it.
 * @param {} cache 
 */
const overrideReset2 = async (cache) => {
  const fnReset = cache.reset.bind(cache);
  cache.reset = (next) => {
    return new Promise((resolve, reject) => {
      fnReset(() => {
        next && next();
        resolve();
      }, (e) => {
        reject(e);
      });
    });
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
  overrideReset2(multiCache);
  return multiCache;
}