import config from 'config';
import log4js from 'log4js';
log4js.configure(config.get('log4js'));
const logger = log4js.getLogger('dreamworld.redis-cache.test2');
import { cacheManager } from '../index.js';


const test = async () => {
  const getCache = cacheManager.getCache;
  const cache1 = getCache('cache1');
  await cache1.set('key1:one', 'value1', 'key2', 'value2', 'key3', 'value3', 'key4', 'value4');
  const keys1 = await cache1.redis.keys();
  logger.debug('cache1 redis keys', keys1);

  const cache2 = getCache('cache2');
  await cache2.set('key1:two', 'value1', 'key2', 'value2', 'key3', 'value3', 'key4', 'value4');
  const keys2 = await cache2.redis.keys();
  logger.debug('cache2 redis keys', keys2);

  const cache3 = getCache('cache3');
  await cache3.set('key1:three', 'value1', 'key2', 'value2', 'key3', 'value3', 'key4', 'value4');
  const keys3 = await cache3.redis.keys();
  logger.debug('cache3 redis keys', keys3);


  // await cache1.redis.reset();
  // await cache2.redis.reset();
}

test();


