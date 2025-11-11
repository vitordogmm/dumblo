const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

async function loadEvents(client) {
  try {
    const eventsDir = path.join(__dirname, '..', 'events');
    const entries = fs.existsSync(eventsDir) ? fs.readdirSync(eventsDir) : [];
    for (const entry of entries) {
      if (!entry.endsWith('.js')) continue;
      const file = path.join(eventsDir, entry);
      try {
        const event = require(file);
        if (!event?.name || typeof event?.execute !== 'function') {
          logger.warn(`Evento inválido em ${file}`);
          continue;
        }
        const register = (ename) => {
          if (event.once) {
            client.once(ename, (...args) => event.execute(client, ...args));
          } else {
            client.on(ename, (...args) => event.execute(client, ...args));
          }
          logger.info(`Evento registrado: ${ename} (once=${!!event.once})`);
        };

        // Registrar apenas o evento suportado, evitando o aviso de depreciação do 'ready'
        register(event.name);
      } catch (e) {
        logger.error(`Falha ao carregar evento ${file}: ${logger.formatError(e)}`);
      }
    }
    logger.success('Eventos carregados com sucesso');
  } catch (error) {
    logger.error(`Erro no carregamento de eventos: ${logger.formatError(error)}`);
    throw error;
  }
}

module.exports = loadEvents;
