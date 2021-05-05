/**
 * Refreshes the in-memory caches for the service-caches, whenever redis data is changed.
 * It registers the listener on redis to get notified when any key is changed/deleted with 
 * pattern `$serviceName:*`. Upon the notificaiton, if that cache is built & it holds that 
 * in-memory key, then that value is refreshed. To refresh a cache value, it first removes that 
 * key from the in-memory cache, and after that it just invokes `get` method on the multi-layer
 * cache; so, that value will be read from the redis and put into in-memory cache.
 */

 export const start = (redisConfig) => {

}