module.exports = {
  bot: {
    name: 'Dumblo',
    version: '1.0.0',
    color: '#FF8C00',
    prefix: '/',
    textPrefix: 'd.',
  },
  colors: {
    primary: '#FF8C00',
    error: '#FF0000',
    loading: '#FFA500',
  },
  game: {
    maxInventorySize: 20,
    startingLupins: 100,
    startingHP: 100,
    startingAttack: 10,
    startingDefense: 5,
  },
  ai: {
    model: 'llama-3.3-70b-versatile',
    maxTokens: 200,
    temperature: 0.8,
    cacheEnabled: true,
    cacheTTL: 86400, // 24h
  },
  cooldowns: {
    default: 3,
    combat: 1,
    explore: 5,
  },
  database: {
    retryAttempts: 3,
    retryDelay: 1000,
  }
};
