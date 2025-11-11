const Redis = require('ioredis');
const logger = require('../utils/logger');

class CacheService {
  constructor({ defaultTTLSeconds = 3600 } = {}) {
    this.defaultTTL = defaultTTLSeconds;
    this.type = 'memory';
    this.memory = new Map();
    this.timers = new Map();

    try {
      const url = process.env.REDIS_URL;
      if (url) {
        this.redis = new Redis(url);
        this.type = 'redis';
        this.redis.on('connect', () => logger.success('[Cache] Conectado ao Redis'));
        this.redis.on('error', (err) => logger.error(`[Cache] Redis error: ${logger.formatError(err)}`));
      }
    } catch (e) {
      logger.warn(`[Cache] Falha ao inicializar Redis, usando memória: ${logger.formatError(e)}`);
    }
  }

  async get(key) {
    try {
      if (this.type === 'redis') {
        const val = await this.redis.get(key);
        if (val === null) {
          logger.warn(`[Cache] MISS ${key}`);
          return null;
        }
        logger.info(`[Cache] HIT ${key}`);
        return JSON.parse(val);
      }
      const entry = this.memory.get(key);
      if (!entry) {
        logger.warn(`[Cache] MISS ${key}`);
        return null;
      }
      if (entry.exp && Date.now() > entry.exp) {
        this.memory.delete(key);
        logger.warn(`[Cache] EXPIRED ${key}`);
        return null;
      }
      logger.info(`[Cache] HIT ${key}`);
      return entry.value;
    } catch (e) {
      logger.error(`[Cache] get error: ${logger.formatError(e)}`);
      return null;
    }
  }

  async set(key, value, ttlSeconds = this.defaultTTL) {
    try {
      if (this.type === 'redis') {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return true;
      }
      const exp = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
      this.memory.set(key, { value, exp });
      if (ttlSeconds) {
        if (this.timers.has(key)) clearTimeout(this.timers.get(key));
        this.timers.set(key, setTimeout(() => this.memory.delete(key), ttlSeconds * 1000));
      }
      return true;
    } catch (e) {
      logger.error(`[Cache] set error: ${logger.formatError(e)}`);
      return false;
    }
  }

  async delete(key) {
    try {
      if (this.type === 'redis') {
        await this.redis.del(key);
        return true;
      }
      if (this.timers.has(key)) clearTimeout(this.timers.get(key));
      return this.memory.delete(key);
    } catch (e) {
      logger.error(`[Cache] delete error: ${logger.formatError(e)}`);
      return false;
    }
  }

  async clear() {
    try {
      if (this.type === 'redis') {
        await this.redis.flushdb();
        return true;
      }
      this.memory.clear();
      for (const t of this.timers.values()) clearTimeout(t);
      this.timers.clear();
      return true;
    } catch (e) {
      logger.error(`[Cache] clear error: ${logger.formatError(e)}`);
      return false;
    }
  }

  async has(key) {
    const val = await this.get(key);
    return val !== null && val !== undefined;
  }
}

module.exports = CacheService;
