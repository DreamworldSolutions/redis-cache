process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
import config from 'config';

import { start as startGlobalCacheRefreshner } from './global-cache-refreshner.js';
import { start as startServiceCacheRefreshner } from './service-cache-refreshner.js';

import log4js from 'log4js';
import redisRetryStrategy from './redis-retry-strategy.js';
import createCache from './create-cache.js';

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
  // _config.redis.retry_strategy = redisRetryStrategy;
  // const redisOptions = {..._config.redis, retry_strategy: redisRetryStrategy}

  //start listener for the service caches
  startServiceCacheRefreshner(redisOptions(), _config.serviceName);

  //start listener for the global caches
  let globalCacheNames = !_config.globalCaches ? [] : Object.keys(_config.globalCaches);
  if (globalCacheNames.length > 0) {
    startGlobalCacheRefreshner(redisOptions(), globalCacheNames);
  }

  initialized = true;
  logger.info("Initialized");
}

const validateInitialized = () => {
  if (!initialized) {
    throw new Error('Initialization is pending');
  }
}

const redisOptions = () => {
  return { ..._config.redis, retry_strategy: redisRetryStrategy };
}

const createServiceCache = (name) => {
  const cacheConfig = _config.serviceCaches && _config.serviceCaches[name] || {};
  const ttl = cacheConfig.ttl;
  const readOnly = cacheConfig.readOnly;
  const cache = serviceCaches[name] = createCache(redisOptions(), `${_config.serviceName}:${name}:`, ttl, readOnly);
  logger.info(`createServiceCache: ${name}`)
  return cache;
}

const createGlobalCache = (name) => {
  const cacheConfig = _config.globalCaches && _config.globalCaches[name];
  if(!cacheConfig) {
    throw new Error(`Cache isn't defined in the config. Make sure you have configured this global cache.`);
  }

  const ttl = cacheConfig.ttl;
  const readOnly = cacheConfig.readOnly;
  const cache = globalCaches[name] = createCache(redisOptions(), `${name}:`, ttl, readOnly);
  logger.info(`createGlobalCache: name=${name}, ttl=${ttl}, readOnly=${readOnly}`)
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

//Auto initialize if the configuration is specified through node config.
if (config.has('redis-cache')) {
  logger.info('node config found....');
  init(config.get('redis-cache'));
}