import log4js from 'log4js';
import * as cacheManager from './cache-manager.js';
import { create } from './cache-refreshner.js';

const logger = log4js.getLogger('dreamworld.redis-cache.global-cache-refreshner');

const parseMessage = (message) => {
  const cacheEntries = {}; //key = cacheName, value = Array of cache keys
  const redisKeys = message.split(',');
  redisKeys.forEach((redisKey) => {
    redisKey = cacheManager._removeCacheKeyPrefix(redisKey);
    const tokens = redisKey.split(':');
    if (tokens.length < 2) {
      logger.warn(`Unexpected redisKey '${redisKey}'. It must be in the format $cacheName:$key`);
      return;
    }

    const cacheName = tokens[0];
    const key = redisKey.substr(cacheName.length + 1);

    let cacheKeys = cacheEntries[cacheName] || [];
    cacheKeys.push(key);
    cacheEntries[cacheName] = cacheKeys;
  });
  return cacheEntries;
}

const getCache = (...args) => cacheManager.getGlobalCache.apply(this, args);
const refreshAllCaches = (...args) => cacheManager.refreshAllGlobalCaches(this, args);

const module = create({ logger, getCache, refreshAllCaches, parseMessage });

export const start = module.start;
export const watch = module.watch;