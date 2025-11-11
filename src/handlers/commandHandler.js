const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');

function readCommandsRecursively(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...readCommandsRecursively(full));
    else if (entry.isFile() && /\.js$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function loadCommands(client) {
  try {
    const commandsDir = path.join(__dirname, '..', 'commands');
    const files = fs.existsSync(commandsDir) ? readCommandsRecursively(commandsDir) : [];
    client.commands = new Collection();
    client.commandsJSON = [];
    client.cooldowns = new Map();

    for (const file of files) {
      try {
        const cmd = require(file);
        if (!cmd?.data || typeof cmd?.execute !== 'function') {
          logger.warn(`Comando inválido em ${file}`);
          continue;
        }
        const name = cmd.data.name;
        client.commands.set(name, cmd);
        if (typeof cmd.data.toJSON === 'function') {
          client.commandsJSON.push(cmd.data.toJSON());
        }
        logger.info(`Carregado comando: ${name} (${cmd.category || 'uncategorized'})`);
      } catch (e) {
        logger.error(`Falha ao carregar comando ${file}: ${logger.formatError(e)}`);
      }
    }

    logger.success(`Total de comandos carregados: ${client.commands.size}`);
  } catch (error) {
    logger.error(`Erro no carregamento de comandos: ${logger.formatError(error)}`);
    throw error;
  }
}

module.exports = loadCommands;
