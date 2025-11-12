require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const logger = require('./utils/logger');
const config = require('./config/config');
const { initializeFirebase } = require('./database/firebase');
const loadCommands = require('./handlers/commandHandler');
const loadEvents = require('./handlers/eventHandler');
const GroqAI = require('./ai/groq');
const CacheService = require('./ai/cache');
const { createKaori } = require('./kaori');

// Validação de variáveis de ambiente obrigatórias
const lifecycle = process.env.npm_lifecycle_event || '';
const isDevExplicit = lifecycle === 'dev';
const isDevEnv = process.env.NODE_ENV === 'development';
// Em 'start', sempre considerar produção, mesmo que NODE_ENV esteja como 'development'
const isDev = isDevExplicit || (lifecycle !== 'start' && isDevEnv);
const requiredEnv = [
  // Tokens/IDs variam entre desenvolvimento e produção
  ...(isDev ? ['DEV_BOT_TOKEN', 'DEV_BOT_ID', 'DEV_SERVER'] : ['DISCORD_TOKEN', 'CLIENT_ID']),
  // Comuns aos dois modos
  'GROQ_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
];

(() => {
  const missing = requiredEnv.filter((k) => !process.env[k] || process.env[k].trim() === '');
  if (missing.length) {
    logger.error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
    process.exit(1);
  }
})();

async function main() {
  try {
    logger.box('Inicialização', 'Iniciando Dumblo ...');

    // Inicializa Firebase
    await initializeFirebase();

    // Cria cliente Discord
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Coleções e propriedades auxiliares no client
    client.commands = new Collection();
    client.cooldowns = new Map();

    // Instancia cache (Redis se REDIS_URL, senão memória) e anexa ao client
    client.cache = new CacheService({ defaultTTLSeconds: 600 });

    // Instancia Kaori (gerencia estados e roteamento de componentes) e registra rotas do fluxo /start
    client.kaori = createKaori(client, { ttl: 600 });
    try {
      const registerStartRoutes = require('./kaori/routes/start');
      registerStartRoutes(client.kaori);
      const registerStatusRoutes = require('./kaori/routes/status');
      registerStatusRoutes(client.kaori);
      logger.info('Kaori inicializado e rotas /start e /status registradas');
    } catch (e) {
      logger.warn(`Kaori: falha ao registrar rotas Kaori — ${logger.formatError(e)}`);
    }

    // Instancia Groq e anexa ao client
    client.groq = new GroqAI({
      model: config.ai.model,
      maxTokens: config.ai.maxTokens,
      temperature: config.ai.temperature,
      cacheEnabled: config.ai.cacheEnabled,
      cacheTTL: config.ai.cacheTTL,
    });

    // Carrega comandos e eventos
    await loadCommands(client);
    await loadEvents(client);

    // Login usando credenciais de acordo com o modo
    const loginToken = isDev ? process.env.DEV_BOT_TOKEN : process.env.DISCORD_TOKEN;
    await client.login(loginToken);

    // Tratamento de erros não capturados
    process.on('unhandledRejection', (reason) => {
      logger.error(`Unhandled Rejection: ${reason?.stack || reason}`);
    });

    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught Exception: ${error.stack || error}`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.warn(`Recebido ${signal}. Encerrando com segurança...`);
      try {
        client.destroy();
      } catch (e) {
        logger.error(`Erro ao destruir client: ${e.stack || e}`);
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error(`Falha na inicialização: ${error.stack || error}`);
    process.exit(1);
  }
}

main();
