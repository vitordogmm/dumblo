const { REST, Routes, ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const { checkConnection } = require('../database/firebase');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    try {
      // Evita execução dupla caso ambos eventos ('ready' e 'clientReady') disparem
      if (client._readyHandled) return;
      client._readyHandled = true;
      const guildCount = client.guilds.cache.size;
      const userCount = client.users?.cache?.size || 0;
      const boxContent = [
        `Bot: ${client.user.tag}`,
        `ID: ${client.user.id}`,
        `Servidores: ${guildCount}`,
        `Usuários (cache): ${userCount}`,
        `Comandos carregados: ${client.commands.size}`,
      ].join('\n');
      logger.box('Dumblo Inicializado', boxContent);

      // Presença dinâmica (alterna entre usuários e servidores)
      const getApproxUserCount = () => {
        // Usa memberCount quando disponível; fallback para cache de usuários
        const totalMembers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
        const fallback = client.users?.cache?.size || 0;
        return totalMembers || fallback || 0;
      };

      let presenceIndex = 0;
      const updatePresence = () => {
        const usuarios = getApproxUserCount();
        const servidores = client.guilds.cache.size;
        const messages = [
          `Trazendo aventuras para ${usuarios} usuarios | /aventura`,
          `Governando ${servidores} servidores | /help`,
        ];
        const name = messages[presenceIndex % messages.length];
        presenceIndex = (presenceIndex + 1) % messages.length;
        client.user.setPresence({
          activities: [{ name, type: ActivityType.Playing }],
          status: 'online',
        });
      };
      updatePresence();
      client._presenceTimer && clearInterval(client._presenceTimer);
      client._presenceTimer = setInterval(updatePresence, 60_000);

      // Verificações
      const firestoreOk = await checkConnection();
      logger.info(`Firestore: ${firestoreOk ? 'conectado' : 'desconectado'}`);
      const groqOk = await client.groq.checkHealth();
      logger.info(`Groq: ${groqOk ? 'conectado' : 'desconectado'}`);

      // Registrar comandos: modo dev (guild) vs produção (global)
      try {
        const lifecycle = process.env.npm_lifecycle_event || '';
        const isDevExplicit = lifecycle === 'dev';
        const isDevEnv = process.env.NODE_ENV === 'development';
        // Em 'start', sempre considerar produção, mesmo que NODE_ENV esteja como 'development'
        const isDev = isDevExplicit || (lifecycle !== 'start' && isDevEnv);
        if (isDev) {
          const rest = new REST({ version: '10' }).setToken(process.env.DEV_BOT_TOKEN);
          await rest.put(
            Routes.applicationGuildCommands(process.env.DEV_BOT_ID, process.env.DEV_SERVER),
            { body: client.commandsJSON }
          );
          logger.success('Comandos registrados apenas no servidor de desenvolvimento');
        } else {
          const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
          await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: client.commandsJSON });
          logger.success('Comandos registrados globalmente');
        }
      } catch (e) {
        logger.error(`Falha ao registrar comandos: ${logger.formatError(e)}`);
      }
    } catch (error) {
      logger.error(`Erro no evento ready: ${logger.formatError(error)}`);
    }
  },
};
