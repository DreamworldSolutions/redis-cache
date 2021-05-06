import config from 'config';
import log4js from 'log4js';
log4js.configure(config.get('log4js'));

const logger = log4js.getLogger('dreamworld.redis-cache.test2');

import { cacheManager } from '../index.js';
logger.info('hello');


const test = async () => {
  const cache1 = cacheManager.getGlobalCache('cache1');
  await cache1.set('key1', 'value1', 'key2', 'value2', 'key3', 'value3', 'key4', 'value4');
  const keys1 = await cache1.redis.keys();
  logger.debug('cache1 redis keys', keys1);

  const cache2 = cacheManager.getGlobalCache('cache2');
  await cache2.set('key1', 'value1', 'key2', 'value2', 'key3', 'value3', 'key4', 'value4');
  const keys2 = await cache2.redis.keys();
  logger.debug('cache2 redis keys', keys2);

  const cache3 = cacheManager.getGlobalCache('cache3');
  await cache3.set('key1', 'value1', 'key2', 'value2', 'key3', 'value3', 'key4', 'value4');
  const keys3 = await cache3.redis.keys();
  logger.debug('cache3 redis keys', keys3);


  // await cache1.redis.reset();
  // await cache2.redis.reset();
}

test();


