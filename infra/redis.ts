import { Redis } from '@upstash/redis';
import { env, validateEnv } from './env';
import { createLogger } from './logger';

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
    } else if (env.REDIS_URL) {
      // For direct Redis connections, we need to parse the URL and extract token
      // Upstash Redis URL format: redis://default:token@host:port
      const urlParts = env.REDIS_URL.split('://');
      const authPart = urlParts[1]?.split('@');
      const token = authPart?.[0]?.split(':')?.[1] || '';
      const hostUrl = authPart?.[1] || urlParts[1];
      
      redis = new Redis({
        url: `https://${hostUrl}`,
        token: token || 'default',
      });
      logger.info('Using direct Redis connection (converted to Upstash format)');
    } else {
      throw new Error('No Redis configuration found. Set REDIS_URL or REDIS_REST_URL/REDIS_REST_TOKEN');
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
