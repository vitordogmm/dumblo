const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const config = require('../config/config');
const CacheService = require('./cache');

class GroqAI {
  constructor({ model, maxTokens, temperature, cacheEnabled = true, cacheTTL = 86400 } = {}) {
    this.model = model || config.ai.model;
    this.maxTokens = maxTokens || config.ai.maxTokens;
    this.temperature = temperature ?? config.ai.temperature;
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.cache = cacheEnabled ? new CacheService({ defaultTTLSeconds: cacheTTL }) : null;
    this.windowMs = 60_000; // 1 minuto
    this.limit = 25; // 25 req/min
    this.timestamps = [];
  }

  async _rateLimit() {
    const now = Date.now();
    // remove timestamps fora da janela
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.limit) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest);
      logger.ai(`Rate limit atingido, aguardando ${Math.ceil(waitMs / 1000)}s`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
    this.timestamps.push(Date.now());
  }

  async generate(prompt, options = {}) {
    try {
      await this._rateLimit();
      const payload = {
        model: this.model,
        messages: [
          { role: 'system', content: 'Você é um assistente de RPG para o bot Dumblo.' },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens,
      };
      const res = await this.client.chat.completions.create(payload);
      const text = res.choices?.[0]?.message?.content || '';
      if (res.usage) {
        logger.ai(`Uso Groq - prompt: ${res.usage.prompt_tokens}, completion: ${res.usage.completion_tokens}`);
      }
      return text;
    } catch (error) {
      logger.error(`Groq generate error: ${logger.formatError(error)}`);
      return '';
    }
  }

  async generateWithCache(key, prompt, options = {}) {
    try {
      if (this.cache) {
        const cached = await this.cache.get(key);
        if (cached) return cached;
      }
      const output = await this.generate(prompt, options);
      if (this.cache) await this.cache.set(key, output, options.ttlSeconds || this.cache.defaultTTL);
      return output;
    } catch (error) {
      logger.error(`Groq generateWithCache error: ${logger.formatError(error)}`);
      return '';
    }
  }

  async judgeAction(action, context = '') {
    const prompt = `Julgue a ação do jogador para um RPG.
Contexto: ${context}
Ação: ${action}
Responda com um breve motivo e uma nota (0-10).`;
    return this.generate(prompt, { temperature: 0.5, maxTokens: 120 });
  }

  async checkHealth() {
    try {
      await this._rateLimit();
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return Boolean(res.choices?.length);
    } catch (e) {
      logger.error(`Groq healthcheck error: ${logger.formatError(e)}`);
      return false;
    }
  }
}

module.exports = GroqAI;
