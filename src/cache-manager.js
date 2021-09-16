process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';

import log4js from 'log4js';
import redisRetryStrategy from './redis-retry-strategy.js';
import createCache from './create-cache.js';
import { start as startServiceCacheRefreshner, watch as watchServiceCache, stopWatch as stopWatchServiceCache, } from './service-cache-refreshner.js';
import { start as startGlobalCacheRefreshner, watch as watchGlobalCache, stopWatch as stopWatchGlobalCache } from './global-cache-refreshner.js';
import moduleConfig from './module-config.js';

const logger = log4js.getLogger('dreamworld.redis-cache.cache-manager');

/**
 * It's the prefix to be applied for all the cache entries managed by this library.
 * For Example, for the distributed (service-specific) caches, actual key will be 
 * `dwcache:$serviceName:$cacheName:$key`.
 * And for the Global caches, redis key will be `dwcache:$cacheName:$key`
 */
export const REDIS_KEY_PREFIX = "dwcache:";

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
  // _config.redis.retry_strategy = redisRetryStrategy;
  // const redisOptions = {..._config.redis, retry_strategy: redisRetryStrategy}

  //start listener for the service caches
  startServiceCacheRefreshner(redisOptions());
  startGlobalCacheRefreshner(redisOptions());

  initialized = true;
  logger.info("Initialized");
}

const validateInitialized = () => {
  if (!initialized) {
    throw new Error('Initialization is pending');
  }
}


/**
 * Rejects cacheName if it contains colon (:) as it's used as the 
 * separator.
 * 
 * @param {*} cacheName 
 */
const validateCacheName = (cacheName) => {
  if (cacheName.indexOf(':') !== -1) {
    throw new Error('Invalid Cache Name. It must not contain colon (:).')
  }
}

const redisOptions = () => {
  return { ..._config.redis, retry_strategy: redisRetryStrategy };
}

const createServiceCache = (name) => {
  validateCacheName(name);
  const cacheConfig = _config.serviceCaches && _config.serviceCaches[name] || {};
  const ttl = cacheConfig.ttl;
  const readOnly = cacheConfig.readOnly;
  const cache = serviceCaches[name] = createCache(redisOptions(), `${REDIS_KEY_PREFIX}${_config.serviceName}:${name}:`, ttl, readOnly);

  cache.disconnect = () => {
    delete serviceCaches[name];
    stopWatchServiceCache(cache);
    _disconnectClient(cache);
    logger.info(`disconnect: done. serviceCache name=${name}`);
  };

  watchServiceCache(cache);
  logger.info(`createServiceCache: ${name}`)
  return cache;
}

const createGlobalCache = (name) => {
  validateCacheName(name);
  const cacheConfig = _config.globalCaches && _config.globalCaches[name] || {};
  const ttl = cacheConfig.ttl;
  const readOnly = cacheConfig.readOnly;
  const cache = globalCaches[name] = createCache(redisOptions(), `${REDIS_KEY_PREFIX}${name}:`, ttl, readOnly);

  cache.disconnect = () => {
    delete globalCaches[name];
    stopWatchGlobalCache(cache);
    _disconnectClient(cache);
    logger.info(`disconnect: done. globalCache name=${name}`);
  };

  watchGlobalCache(cache);
  logger.info(`createGlobalCache: name=${name}, ttl=${ttl}, readOnly=${readOnly}`);
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

/**
 * Refreshes in-memory cache entries for all the active global caches.
 * Ideally, this method shouldn't be used by the user. It's being used by the 
 * `global-cache-refresher` when redis connection is restored after the disconnection.
 */
export const refreshAllGlobalCaches = () => {
  let promises = Object.entries(globalCaches).map(async (entry) => {
    const cacheName = entry[0];
    const cache = entry[1];
    const n = await cache.refreshAll();
    logger.info(`refreshAllGlobalCaches: done. cache=${cacheName}, noOfKeys=${n}`);
  });

  return Promise.all(promises);
}

/**
 * Refreshes in-memory cache entries for all the active service caches.
 * Ideally, this method shouldn't be used by the user. It's being used by the 
 * `service-cache-refresher` when redis connection is restored after the disconnection.
 */
export const refreshAllCaches = () => {
  let promises = Object.entries(serviceCaches).map(async (entry) => {
    const cacheName = entry[0];
    const cache = entry[1];
    const n = await cache.refreshAll();
    logger.info(`refreshAllCaches: done. cache=${cacheName}, noOfKeys=${n}`);
  });

  return Promise.all(promises);
}


/**
 * Removes library prefix (REDIS_KEY_PREFIX=dwcache:) from the given cacheKey.
 * This is to be used internally by the library only.
 * @param {String} cacheKey 
 */
export const _removeCacheKeyPrefix = (cacheKey) => {
  if (cacheKey.indexOf(REDIS_KEY_PREFIX) === 0) {
    return cacheKey.substr(REDIS_KEY_PREFIX.length);
  } else {
    logger.warn(`cacheKey=${cacheKey} doesn't start with ${REDIS_KEY_PREFIX}`);
    return cacheKey;
  }
}

const _disconnectClient = (cache) => {
  try {
    const redisClient = cache.redis.store.getClient();
    redisClient.quit();
  } catch (e) {
    logger.error('_disconnectClient: failed', e);
  }
}


// console.log('config', moduleConfig);

//Auto initialize if the configuration is specified through node config.
init(moduleConfig);