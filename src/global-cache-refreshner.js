/**
 * Refreshes the in-memory cached detail for the service-caches, whenever redis data is changed.
 * It registers the listener on redis to get notified when any key is changed/deleted with 
 * pattern `$serviceName:$globalcacheName:*`. Cache refresh mechanism is same as the
 * `service-cache-refresher`.
 */



import redis from 'redis';
import { promisify } from 'util';
import log4js from 'log4js';
import * as cacheManager from './cache-manager.js';

const logger = log4js.getLogger('dreamworld.redis-cache.global-cache-refreshner');

const refreshCacheEntry = async (cacheName, key) => {
  try {
    const cache = cacheManager.getGlobalCache(cacheName, true);
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
export const start = (redisConfig, cacheNames) => {
  if (!cacheNames || cacheNames.length === 0) {
    logger.info('start: skipped as no globalCaches defined');
    return;
  }

  const redisClient = redis.createClient(redisConfig);
  const clientCommand = promisify(redisClient.client).bind(redisClient);


  redisClient.on('connect', async () => {
    const prefixArguments = [];
    cacheNames.forEach((cacheName) => {
      prefixArguments.push('PREFIX');
      prefixArguments.push(`${cacheName}:`)
    });
    let clientId = await clientCommand('ID');
    await clientCommand('TRACKING', ['on', `REDIRECT`, `${clientId}`, 'BCAST', 'NOLOOP', ...prefixArguments]);
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
    if (tokens.length != 2) {
      logger.warn(`Unexpected redisKey '${redisKey}'. It must be in the format $cacheName:$key`);
      return;
    }
    const cacheName = tokens[0];
    const key = tokens[1];
    refreshCacheEntry(cacheName, key);
  });

}