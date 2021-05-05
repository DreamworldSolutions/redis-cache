/**
 * Refreshes the in-memory cached detail for the service-caches, whenever redis data is changed.
 * It registers the listener on redis to get notified when any key is changed/deleted with 
 * pattern `$serviceName:$globalcacheName:*`. Cache refresh mechanism is same as the
 * `service-cache-refresher`.
 */


export const start = (redisConfig, cacheNames) => {

}