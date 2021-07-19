import config from 'config';
import log4js from 'log4js';
log4js.configure(config.get('log4js'));

const logger = log4js.getLogger('dreamworld.redis-cache.test');

import { cacheManager } from '../index.js';
logger.info('hello');


const test = async () => {
  const cache1 = cacheManager.getGlobalCache('cache2');

  // const keys = await cache1.redis.keys();
  // logger.info("cache keys", keys);
  // return;

  // await cache1.reset();
  // logger.info("Cache Cleared");
  // return;




  await cache1.set('key1', 'value1');
  await cache1.set('key2', 'value2');
  await cache1.set('key3', 'value3');
  await cache1.set('key4:nested', 'Rock the world');



  await cache1.set('unknown', 'hello');
  logger.info('unknown key set');
  let mValue = await cache1.mget('key1', 'key2', 'unknown', 'key3', 'key4:nested');
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

  setInterval(async () => {
    let wrapVal1 = await cache1.wrap('wrapkey1', async () => {
      logger.info("wrapKey1 actual logic invoked");
      return [
        { companyId: '0a2993f19a569df1b41467a984301bce', role: 'OWNER' },
        { companyId: '86d6271dc7554413a662345b499ac0c9', role: 'OWNER' },
        { companyId: '5459c32fda80403e3e85d482971224c0', role: 'OWNER' },
        { companyId: 'e2e501fed8b8c13993d5b217b0035249', role: 'VIEWER' },
        { companyId: 'bf463893a77b9aeb31a995c4b880fac3', role: 'OWNER' }
      ];
    });
    logger.info('wrapVal1', wrapVal1);
  }, 3000);


}

test();


