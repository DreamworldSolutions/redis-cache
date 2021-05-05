import config from 'config';
import log4js from 'log4js';
log4js.configure(config.get('log4js'));

const logger = log4js.getLogger('dreamworld.redis-cache.test');

import { cacheManager } from '../index.js';
logger.info('hello');


const test = async () => {
  const cache1 = cacheManager.getGlobalCache('cache1');
  // await cache1.set('key1', 'value1');
  // await cache1.set('key2', 'value2');
  // await cache1.set('key3', 'value3');


  await cache1.set('unknown', 'hello');
  let mValue = await cache1.mget('key1', 'key2', 'unknown', 'key3');
  logger.info('mValue =', mValue);

  let startTime = new Date().getTime();
  let value1 = await cache1.get('key1');
  logger.info(`value1=${value1}, duration=${new Date().getTime() - startTime}`);

  startTime = new Date().getTime();
  value1 = await cache1.get('key2');
  logger.info(`value1=${value1}, duration=${new Date().getTime() - startTime}`);

  startTime = new Date().getTime();
  value1 = await cache1.get('key3');
  logger.info(`value1=${value1}, duration=${new Date().getTime() - startTime}`);

  startTime = new Date().getTime();
  value1 = await cache1.memory.get('key1');
  logger.info(`value1=${value1}, duration=${new Date().getTime() - startTime}`);

  let wrapVal1 = await cache1.wrap('wrapkey1', async () => {
    return 'wrapVal1';
  }, {
    isCacheableValue: () => false
  });
  logger.info('wrapVal1', wrapVal1);

  wrapVal1 = await cache1.get('wrapkey1');
  logger.info('wrapVal1', wrapVal1);
}

test();


