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

const parseMessage = (message) => {
  const cacheEntries = {}; //key = cacheName, value = Array of cache keys
  const redisKeys = message.split(',');
  redisKeys.forEach((redisKey) => {
    const tokens = redisKey.split(':');
    if (tokens.length != 3) {
      logger.warn(`Unexpected redisKey '${redisKey}'. It must be in the format $serviceName:$cacheName:$key`);
      return;
    }

    const cacheName = tokens[1];
    const key = tokens[2];

    let cacheKeys = cacheEntries[cacheName] || [];
    cacheKeys.push(key);
    cacheEntries[cacheName] = cacheKeys;

  });
  return cacheEntries;
}

const refreshCacheEntries = async (cacheName, keys) => {
  try {
    const cache = cacheManager.getCache(cacheName, true);
    if (!cache) {
      logger.trace(`refreshCacheEntry: Cache doesn't exist. name=${cacheName}`);
      return;
    }

    let refreshedKeys = await cache.refresh(keys);
    if (refreshedKeys.length > 0) {
      logger.debug(`refreshCacheEntry: done. name=${cacheName}, refreshedKeys=${refreshedKeys}`);
    }
  } catch (error) {
    logger.error(`refreshCacheEntry: failed. name=${cacheName}, keys=${keys}`, error)
  }
}
export const start = (redisConfig, serviceName) => {
  const redisClient = redis.createClient(redisConfig);

  const clientCommand = promisify(redisClient.client).bind(redisClient);

  let connected = false;
  let clientId;
  redisClient.on('connect', async () => {

    if (connected) {
      //Do on re-connection
      try {
        redisClient.quit();
        logger.info('on reconnected: quit the current client..')
      } catch (err) {
        logger.error('on reconnected: failed to quit current client.', errr)
      }
      await cacheManager.refreshAllCaches();
      logger.info('on reconnected: all caches refreshed.');
      start(redisConfig, serviceName);
      return;
    }

    //Initial connection
    try {
      connected = true;
      clientId = await clientCommand('ID');
      await clientCommand('TRACKING', ['on', `REDIRECT`, `${clientId}`, 'BCAST', 'NOLOOP', 'PREFIX', `${serviceName}:`]);
      await redisClient.subscribe('__redis__:invalidate');
      logger.info(`TRACKING enabled. clientId=${clientId}`);
    } catch (error) {
      logger.error('Failed to enable TRACKING', error);
    }

  });

  redisClient.on("message", function (channel, message) {
    if (channel !== '__redis__:invalidate') {
      logger.trace(`onMessage: discarded. channel=${channel}, message=${message}`);
      return;
    }

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