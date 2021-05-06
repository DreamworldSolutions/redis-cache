process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
import config from 'config';

import { start as startGlobalCacheRefreshner } from './global-cache-refreshner.js';
import { start as startServiceCacheRefreshner } from './service-cache-refreshner.js';

import cacheManager from 'cache-manager';
import redisStore from 'cache-manager-redis-store';

import log4js from 'log4js';

const logger = log4js.getLogger('dreamworld.redis-cache.cache-manager');


/**
 * Holds the service caches built so far.
 */
const serviceCaches = {};

/**
 * Holds the global caches built so far.
 */
const globalCaches = {};

const SAMPLE_CONFIG = {
  serviceName: 'user',
  redis: {
    host: '127.0.0.1',
    port: 6379,
    password: '1234'
  },
  serviceCaches: {
    cache1: {
      ttl: 600 //in seconds
    },
    cache2: {
      ttl: 600 //in seconds
    }
  },
  globalCaches: {
    cache1: {
      ttl: 600, //in seconds
      readOnly: true
    }
  }
};

/**
 * 
 */
let _config = {};

let initialized = false;

export const init = (conf) => {
  //TODO: Validate config
  _config = conf;

  logger.debug('init: config=', _config);

  //start listener for the service caches
  startServiceCacheRefreshner(_config.redis, _config.serviceName);

  //start listener for the global caches
  let globalCacheNames = !_config.globalCaches ? [] : Object.keys(_config.globalCaches);
  if (globalCacheNames.length > 0) {
    startGlobalCacheRefreshner(_config.redis, globalCacheNames);
  }

  initialized = true;
  logger.info("Initialized");
}

const validateInitialized = () => {
  if (!initialized) {
    throw new Error('Initialization is pending');
  }
}

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
 * Adds a `refresh(key)` method to the cache. 
 * On `refresh` the in-memory value of that cache-entry is updated/refreshed with the redis
 * cache value.
 * @param {caching} cache 
 */
const addRefresh = (cache) => {
  cache.refresh = async (key) => {
    let value = await cache.memory.get(key);
    if (value === null || value === undefined) {
      logger.trace(`refresh: CacheEntry doesn't exist. prefix=${cache.prefix}, key=${key}`);
      return false;
    }

    await cache.memory.del(key);
    await cache.get(key);
    logger.debug(`refresh: done. prefix=${cache.prefix}, key=${key}, value=${value}`);
    return true;
  }
}

const createCache = (prefix, ttl, readOnly = false) => {
  let redisCache = cacheManager.caching({ store: redisStore, ..._config.redis, prefix, ttl: ttl });
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

const createServiceCache = (name) => {
  const cacheConfig = _config.serviceCaches && _config.serviceCaches[name] || {};
  const ttl = cacheConfig.ttl;
  const readOnly = cacheConfig.readOnly;
  const cache = serviceCaches[name] = createCache(`${_config.serviceName}:${name}:`, ttl, readOnly);
  logger.info(`createServiceCache: ${name}`)
  return cache;
}

const createGlobalCache = (name) => {
  const cacheConfig = _config.globalCaches && _config.globalCaches[name] || {};
  const ttl = cacheConfig.ttl;
  const readOnly = cacheConfig.readOnly;
  const cache = globalCaches[name] = createCache(`${name}:`, ttl, readOnly);
  logger.info(`createGlobalCache: ${name}`)
  return cache;
}

export const getCache = (cacheName, skipCreateNew = false) => {
  validateInitialized();

  if (skipCreateNew) {
    return serviceCaches[cacheName];
  } else {
    return serviceCaches[cacheName] || createServiceCache(cacheName);
  }

}

export const getGlobalCache = (cacheName, skipCreateNew = false) => {
  validateInitialized();

  if (skipCreateNew) {
    return globalCaches[cacheName];
  } else {
    return globalCaches[cacheName] || createGlobalCache(cacheName);
  }
}

//Auto initialize if the configuration is specified through node config.
if (config.has('redis-cache')) {
  logger.info('node config found....');
  init(config.get('redis-cache'));
}