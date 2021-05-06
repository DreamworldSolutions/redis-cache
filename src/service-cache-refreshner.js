/**
 * Refreshes the in-memory caches for the service-caches, whenever redis data is changed.
 * It registers the listener on redis to get notified when any key is changed/deleted with 
 * pattern `$serviceName:*`. Upon the notificaiton, if that cache is built & it holds that 
 * in-memory key, then that value is refreshed. To refresh a cache value, it first removes that 
 * key from the in-memory cache, and after that it just invokes `get` method on the multi-layer
 * cache; so, that value will be read from the redis and put into in-memory cache.
 */

import redis from 'redis';
import { promisify } from 'util';
import log4js from 'log4js';
import * as cacheManager from './cache-manager.js';

const logger = log4js.getLogger('dreamworld.redis-cache.service-cache-refreshner');

const refreshCacheEntry = async (cacheName, key) => {
  try {
    const cache = cacheManager.getCache(cacheName, true);
    if (!cache) {
      logger.trace(`refreshCacheEntry: Cache doesn't exist. name=${cacheName}`);
      return;
    }

    let refreshed = await cache.refresh(key);
    if(refreshed) {
      logger.debug(`refreshCacheEntry: done. name=${cacheName}, key=${key}`);
    }
  } catch (error) {
    logger.error(`refreshCacheEntry: failed. name=${cacheName}, key=${key}`, error)
  }
}
export const start = (redisConfig, serviceName) => {
  const redisClient = redis.createClient(redisConfig);

  const clientCommand = promisify(redisClient.client).bind(redisClient);

  redisClient.on('connect', async () => {
    let clientId = await clientCommand('ID');
    await clientCommand('TRACKING', ['on', `REDIRECT`, `${clientId}`, 'BCAST', 'NOLOOP', 'PREFIX', `${serviceName}:`]);
    await redisClient.subscribe('__redis__:invalidate');
    logger.info(`started. redisClientId=${clientId}`);
  });

  redisClient.on("message", function (channel, message) {
    if (channel !== '__redis__:invalidate') {
      logger.trace(`onMessage: discarded. channel=${channel}, message=${message}`);
      return;
    }
    const redisKey = message;
    const tokens = redisKey.split(':');
    if (tokens.length != 3) {
      logger.warn(`Unexpected redisKey '${redisKey}'. It must be in the format $serviceName:$cacheName:$key`);
      return;
    }
    const cacheName = tokens[1];
    const key = tokens[2];
    refreshCacheEntry(cacheName, key);
  });

}