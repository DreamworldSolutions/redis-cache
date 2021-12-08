import cacheManager from 'cache-manager';
import redisStore from 'cache-manager-redis-store';
import log4js from 'log4js';

const logger = log4js.getLogger('dreamworld.redis-cache.cache-manager');

/**
 * It adds given keys into `__keys__` Set.
 * @param {*} cache 
 * @param {Array} keys 
 */
const _setKeys = (cache, keys) => {
  return new Promise((resolve, reject) => {
    const redisClient = cache.store.getClient();
    redisClient.sadd(['__keys__', ...keys], function (err, res) {
      if (err) {
        reject(err);
        return;
      }

      logger.trace(`set: key added into Set. key=${keys}`);
      resolve();
    });
  });
};

/**
 * It removes given keys from `__keys__` Set.
 * @param {*} cache 
 * @param {Array} keys 
 */
const _deleteKeys = (cache, keys) => {
  return new Promise((resolve, reject) => {
    const redisClient = cache.store.getClient();

    redisClient.srem(['__keys__', ...keys], function (err, res) {
      if (err) {
        reject(err);
        return;
      }

      logger.trace(`del: keys removed from Set. keys=${keys}`);
      resolve();
    });
  });
};

/**
 * Overrides given redisCache's set() method.
 * @param {*} cache 
 */
const overrideSet = (cache) => {
  const _set = cache.store.set;

  cache.store.set = async (...args) => {
    await _setKeys(cache, [args[0]]);
    await _set.apply(cache.store, [...args]);
  };

  cache.set = cache.store.set.bind(cache.store);
};

/**
 * Overrides given redisCache's mset() method.
 * @param {*} cache 
 */
const overrideMSet = (cache) => {
  const _mset = cache.store.mset;

  cache.store.mset = async (...args) => {
    let keys = [];
    let _args = [...args];

    if (typeof _args[_args.length - 1] === 'function') {
      _args.pop();
    }

    if (_args[_args.length - 1] instanceof Object && _args[_args.length - 1].constructor === Object) {
      _args.pop();
    }

    for (let i = 0; i < _args.length; i += 2) {
      keys.push(_args[i]);
    }

    await _setKeys(cache, keys);
    await _mset.apply(cache.store, [...args]);
  };

  cache.set = cache.store.set.bind(cache.store);
};

/**
 * Overrides given redisCache's del() method.
 * @param {*} cache 
 */
const overrideDel = (cache) => {
  const _del = cache.store.del;

  cache.store.del = async (...args) => {
    let _args = [...args];
    let skipDelKeys = false;

    if (typeof _args[_args.length - 1] === 'function') {
      _args.pop();
    }

    if (_args[_args.length - 1] instanceof Object && _args[_args.length - 1].constructor === Object) {
      _args.pop();
    }

    if (typeof _args[_args.length - 1] === 'boolean') {
      args.splice(_args.length - 1, 1);
      skipDelKeys = _args.pop();
    }

    if(Array.isArray(args[0])) {
      _args = [...args[0]];
    }

    if(!skipDelKeys) {
      await _deleteKeys(cache, _args);
    }

    await _del.apply(cache.store, [...args]);
  };

  cache.del = cache.store.del.bind(cache.store);
};

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
  const redisClient = cache.store.getClient();

  cache.store.keys = (pattern = "*", cb) => {
    return new Promise((resolve, reject) => {
      if (typeof pattern === 'function') {
        cb = pattern;
        pattern = '*';
      }

      logger.trace(`keys: invoked. prefix=${prefix}, pattern=${pattern}`);

      redisClient.smembers('__keys__', function(err, keys) {
        if (err) {
          reject(err);
          return;
        }

        cb && cb(keys);
        resolve(keys);
      });
    });
  };

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

    await cache.del(keys, true);
    await cache.del('__keys__', true);
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
  overrideSet(redisCache);
  overrideMSet(redisCache);
  overrideDel(redisCache);
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