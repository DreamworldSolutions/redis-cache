# Troubleshooting

### Error: Callback was already called.

My service logs/stops/crashes with the following errors.
```
/Users/chirag/projects/dw/github/redis-cache/node_modules/async/dist/async.js:318
            if (fn === null) throw new Error("Callback was already called.");
                             ^

Error: Callback was already called.
    at /Users/chirag/projects/dw/github/redis-cache/node_modules/async/dist/async.js:318:36
    at callback (/Users/chirag/projects/dw/github/redis-cache/node_modules/cache-manager/lib/multi_caching.js:138:17)
    at Command.callback (/Users/chirag/projects/dw/github/redis-cache/node_modules/cache-manager-redis-store/dist/index.js:249:18)
    at normal_reply (/Users/chirag/projects/dw/github/redis-cache/node_modules/redis/index.js:655:21)
    at RedisClient.return_reply (/Users/chirag/projects/dw/github/redis-cache/node_modules/redis/index.js:753:9)
    at JavascriptRedisParser.returnReply (/Users/chirag/projects/dw/github/redis-cache/node_modules/redis/index.js:138:18)
    at JavascriptRedisParser.execute (/Users/chirag/projects/dw/github/redis-cache/node_modules/redis-parser/lib/parser.js:544:14)
    at Socket.<anonymous> (/Users/chirag/projects/dw/github/redis-cache/node_modules/redis/index.js:219:27)
    at Socket.emit (node:events:365:28)
    at addChunk (node:internal/streams/readable:314:12)
```

I encountered this error while testing the library in my local. For me the root cause was that the value stored for a redis-key wasn't JSON parsable. So, first look for the similar possibility.

You may enable `TRACE` level log; see what the library was trying to do exactly before this error. If it's about refreshing the cache entries, then you might be facing the same issue. You will find the problematic redis key(s) from the logs.