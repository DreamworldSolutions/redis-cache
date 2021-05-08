/**
 * Refreshes the in-memory caches whenever redis data is changed.
 * 
 * All the caches created by the `cacheManager` should be registered here for the watch.
 * Upon the notification, if the cache holds that in-memory key, then that value is refreshed. 
 */
import redis from 'redis';
import { promisify } from 'util';
import { setPromiseTimeout } from './util.js';

export const create = ({ logger, parseMessage, getCache, refreshAllCaches }) => {

  const refreshCacheEntries = async (cacheName, keys) => {
    try {
      const cache = getCache(cacheName, true);
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


  /**
   * Sends ping command at the interval of 3 seconds. If it doesn't receive the reply
   * for consecutive 3 attempts, it quites the client.
   * @param {*} redisClient 
   */
  const pingWatch = (redisClient, redisConfig) => {
    const pingCommand = promisify(redisClient.ping).bind(redisClient);
    const maxFailedPings = 10;
    const pingInterval = 3000;

    let failedPings = 0;
    const intervalHandle = setInterval(async () => {
      try {
        let response = await setPromiseTimeout(pingCommand('hello'), 2900);
        logger.trace('pingWatch: response:', response);
        failedPings = 0; //reset counter
      } catch (err) {
        failedPings++;
        if (failedPings < maxFailedPings) {
          logger.warn(`pingWatch: failed. attempt=${failedPings}`);
          return;
        }

        //quite the client
        clearInterval(intervalHandle);
        logger.warn(`pingWatch: quitting the client, as 3 consecutive pings dropped.`);
        redisClient.quit();
        logger.warn('pingWatch: retrying connection...');
        start(redisConfig);
      }
    }, pingInterval);
  }

  let clientId;
  let listenerClient;

  const start = (redisConfig) => {
    listenerClient = redis.createClient(redisConfig);

    let connected = false;
    listenerClient.on('connect', async () => {

      if (connected) {
        //Do on re-connection
        try {
          listenerClient.quit();
          logger.info('on reconnected: quit the current client..')
        } catch (err) {
          logger.error('on reconnected: failed to quit current client.', errr)
        }
        await refreshAllCaches();
        logger.info('on reconnected: all caches refreshed.');
        start(redisConfig);
        return;
      }

      //Initial connection
      try {
        connected = true;
        const clientCommand = promisify(listenerClient.client).bind(listenerClient);
        clientId = await clientCommand('ID');
        await listenerClient.subscribe('__redis__:invalidate');
        logger.info(`TRACKING enabled. clientId=${clientId}`);
        _watchAll();
        pingWatch(listenerClient, redisConfig);
      } catch (error) {
        logger.error('Failed to enable TRACKING', error);
      }

    });

    listenerClient.on("message", function (channel, message) {
      if (channel !== '__redis__:invalidate') {
        logger.trace(`onMessage: discarded. channel=${channel}, message=${message}`);
        return;
      }

      let cacheKeysByName = parseMessage(message);
      Object.keys(cacheKeysByName).forEach((cacheName) => {
        refreshCacheEntries(cacheName, cacheKeysByName[cacheName]);
      });
    });

    listenerClient.on('reconnecting', (...args) => {
      logger.warn(`connection lost. clientId=${clientId} reconnecting....`, args);
    });

    listenerClient.on('end', () => {
      logger.info(`connection ended. clientId=${clientId}`);
    });

    listenerClient.on('error', (...args) => {
      logger.error(`error encountered. clientId=${clientId}`, args);
    });

  }


  const _watchRequests = [];

  const _watchAll = () => {
    logger.debug(`_watchAll: invoked. noOfRequests=${_watchRequests.length}`);
    _watchRequests.forEach(({ redisClient, prefix }) => _watch(redisClient, prefix));
  }

  const _watch = async (redisClient, prefix) => {
    logger.trace(`_watch: invoked. prefix=${prefix}`);
    const clientCommand = promisify(redisClient.client).bind(redisClient);

    //Turn off tracking if it's already enabled. Because, redis gives error if Tracking enabled
    //for the same prefix again; which happens in the case of the connection lost & re-gained.
    await clientCommand('TRACKING', ['off']); 
    await clientCommand('TRACKING', ['on', `REDIRECT`, `${clientId}`, 'BCAST', 'NOLOOP', 'PREFIX', `${prefix}`]);
    logger.info(`_watch: completed. prefix=${prefix}`);
  }

  const watch = (cache) => {
    const redisClient = cache.redis.store.getClient(), prefix = cache.prefix;
    logger.trace(`watch: invoked. prefix=${prefix}`);
    _watchRequests.push({ redisClient, prefix });
    if (clientId) {
      _watch(redisClient, prefix);
    }
  }

  return {
    watch,
    start
  };

};


