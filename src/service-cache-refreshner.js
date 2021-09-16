import log4js from 'log4js';
import * as cacheManager from './cache-manager.js';
import { create } from './cache-refreshner.js';

const logger = log4js.getLogger('dreamworld.redis-cache.service-cache-refreshner');

const parseMessage = (message) => {
  const cacheEntries = {}; //key = cacheName, value = Array of cache keys
  const redisKeys = message.split(',');
  redisKeys.forEach((redisKey) => {
    redisKey = cacheManager._removeCacheKeyPrefix(redisKey);
    const tokens = redisKey.split(':');
    if (tokens.length < 3) {
      logger.warn(`Unexpected redisKey '${redisKey}'. It must be in the format $serviceName:$cacheName:$key`);
      return;
    }

    const cacheName = tokens[1];
    const key = redisKey.substr(tokens[0].length + cacheName.length + 2);

    let cacheKeys = cacheEntries[cacheName] || [];
    cacheKeys.push(key);
    cacheEntries[cacheName] = cacheKeys;

  });
  return cacheEntries;
}

const getCache = (...args) => cacheManager.getCache.apply(this, args);

const refreshAllCaches = (...args) => cacheManager.refreshAllCaches(this, args);

const module = create({ logger, getCache, refreshAllCaches, parseMessage });

export const start = module.start;
export const watch = module.watch;
export const stopWatch = module.stopWatch;