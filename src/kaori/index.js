class Router {
  constructor(client) {
    this.client = client;
    this.routes = [];
  }
  register(predicate, handler) {
    this.routes.push({ predicate, handler });
  }
  async handle(interaction) {
    for (const { predicate, handler } of this.routes) {
      try {
        if (predicate(interaction)) {
          await handler(interaction, this.client);
          return true;
        }
      } catch (e) {
        // Se um handler falhar, consideramos como não tratado para permitir fallback
      }
    }
    return false;
  }
}

class SessionStore {
  constructor(client, ttlSeconds = 600) {
    this.client = client;
    this.ttl = ttlSeconds;
  }
  async get(key) {
    return this.client.cache?.get(`kaori:${key}`);
  }
  async set(key, value, ttl = this.ttl) {
    return this.client.cache?.set(`kaori:${key}`, value, ttl);
  }
  async clear(key) {
    return this.client.cache?.delete(`kaori:${key}`);
  }
}

function createKaori(client, options = {}) {
  const ttl = typeof options.ttl === 'number' ? options.ttl : 600;
  const router = new Router(client);
  const session = new SessionStore(client, ttl);
  return { router, session };
}

module.exports = { createKaori };

