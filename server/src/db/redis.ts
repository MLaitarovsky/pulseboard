import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
  console.log('🔴 Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

// Separate client for Pub/Sub (subscribers can't run other commands)
const redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export { redis, redisSub };
