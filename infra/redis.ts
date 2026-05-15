import { Redis } from '@upstash/redis';
import { env, validateEnv } from './env';
import { createLogger } from './env';

validateEnv();

const logger = createLogger('Redis');

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    if (env.REDIS_REST_URL && env.REDIS_REST_TOKEN) {
      redis = new Redis({
        url: env.REDIS_REST_URL,
        token: env.REDIS_REST_TOKEN,
      });
      logger.info('Using Upstash REST Redis');
    } else {
      redis = new Redis({
        url: env.REDIS_URL,
      });
      logger.info('Using direct Redis connection');
    }
  }
  return redis;
}

export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(key);
    return data ? JSON.parse(data as string) : null;
  } catch (error) {
    logger.error(`Redis GET failed for key ${key}`, error);
    return null;
  }
}

export async function redisSet(key: string, value: any, ttl?: number): Promise<void> {
  try {
    const redis = getRedis();
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  } catch (error) {
    logger.error(`Redis SET failed for key ${key}`, error);
  }
}

export async function redisDel(key: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(key);
  } catch (error) {
    logger.error(`Redis DEL failed for key ${key}`, error);
  }
}

export async function redisKeys(pattern: string): Promise<string[]> {
  try {
    const redis = getRedis();
    return await redis.keys(pattern);
  } catch (error) {
    logger.error(`Redis KEYS failed for pattern ${pattern}`, error);
    return [];
  }
}

export async function redisIncr(key: string): Promise<number> {
  try {
    const redis = getRedis();
    return await redis.incr(key);
  } catch (error) {
    logger.error(`Redis INCR failed for key ${key}`, error);
    return 0;
  }
}

export async function redisExpire(key: string, ttl: number): Promise<void> {
  try {
    const redis = getRedis();
    await redis.expire(key, ttl);
  } catch (error) {
    logger.error(`Redis EXPIRE failed for key ${key}`, error);
  }
}
