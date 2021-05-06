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

const parseMessage = (message) => {
  const cacheEntries = {}; //key = cacheName, value = Array of cache keys
  const redisKeys = message.split(',');
  redisKeys.forEach((redisKey) => {
    const tokens = redisKey.split(':');
    if (tokens.length != 2) {
      logger.warn(`Unexpected redisKey '${redisKey}'. It must be in the format $cacheName:$key`);
      return;
    }

    const cacheName = tokens[0];
    const key = tokens[1];

    let cacheKeys = cacheEntries[cacheName] || [];
    cacheKeys.push(key);
    cacheEntries[cacheName] = cacheKeys;
  });
  return cacheEntries;
}

const refreshCacheEntries = async (cacheName, keys) => {
  try {
    const cache = cacheManager.getGlobalCache(cacheName, true);
    if (!cache) {
      logger.trace(`refreshCacheEntry: Cache doesn't exist. name=${cacheName}`);
      return;
    }

    let refreshedKeys = await cache.refresh(keys);
    if (refreshedKeys) {
      logger.debug(`refreshCacheEntry: done. name=${cacheName}, refreshedKeys=${refreshedKeys}`);
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

  let connected = false;
  let clientId;

  redisClient.on('connect', async () => {
    if (connected) {
      //on re-connection
      try {
        redisClient.quit();
        logger.info('on reconnected: quit the current client..')
      } catch (err) {
        logger.error('on reconnected: failed to quit current client.', errr)
      }

      await cacheManager.refreshAllGlobalCaches();
      logger.info('on reconnected: all caches refreshed.');
      start(redisConfig, cacheNames);
      return;
    }

    //on initial connection
    try {
      connected = true;
      const prefixArguments = [];
      cacheNames.forEach((cacheName) => {
        prefixArguments.push('PREFIX');
        prefixArguments.push(`${cacheName}:`)
      });
      clientId = await clientCommand('ID');
      await clientCommand('TRACKING', ['on', `REDIRECT`, `${clientId}`, 'BCAST', 'NOLOOP', ...prefixArguments]);
      await redisClient.subscribe('__redis__:invalidate');
      logger.info(`TRACKING enabled. clientId=${clientId}`);
    } catch (error) {
      logger.error('failed to enable TRACKING', error);
    }

  });

  redisClient.on("message", function (channel, message) {
    if (channel !== '__redis__:invalidate') {
      logger.trace(`onMessage: discarded. channel=${channel}, message=${message}`);
      return;
    }
    logger.trace(`on-message: message=${message}`);
    let cacheKeysByName = parseMessage(message);
    Object.keys(cacheKeysByName).forEach((cacheName) => {
      refreshCacheEntries(cacheName, cacheKeysByName[cacheName]);
    });
  });

  redisClient.on('reconnecting', (...args) => {
    logger.warn(`connection lost. clientId=${clientId} reconnecting....`, args);
  });

  redisClient.on('end', () => {
    logger.info(`connection ended. clientId=${clientId}`);
  });

  redisClient.on('error', (...args) => {
    logger.error(`error encountered. clientId=${clientId}`, args);
  });

}