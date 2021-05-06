import config from 'config';
import log4js from 'log4js';
log4js.configure(config.get('log4js'));

const logger = log4js.getLogger('dreamworld.redis-cache.test2');

import { cacheManager } from '../index.js';
logger.info('hello');


const test = async () => {
  const cache2 = cacheManager.getCache('cache2');
  await cache2.set('key1', 'value1');
  setTimeout(async () => {
    let val = await cache2.get('key1');
    logger.info('After 3 seconds, value=', val); //expected `value1`
  }, 3000);

  // setTimeout(async () => {
  //   // let memoryVal = await cache2.memory.get('key1');
  //   // let redisval = await cache2.redis.get('key1');
  //   let val = await cache2.get('key1');
  //   logger.info('After 5 seconds, values=', val); //expected `undefined`
  // }, 5500);

  setTimeout(async () => {
    let startTime = new Date().getTime();
    let val = await cache2.get('key5');
    logger.info('After 10 seconds, key5 value=', val, 'duration', new Date().getTime() - startTime); //expected `undefined`
  }, 20000);

  setTimeout(async () => {
    let startTime = new Date().getTime();
    let val = await cache2.get('key1');
    logger.info('After 10 seconds, key1 value=', val, 'duration', new Date().getTime() - startTime); //expected `undefined`
  }, 20000);
}

test();


