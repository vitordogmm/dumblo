const { MessageFlags } = require('discord.js');
const logger = require('./logger');
const { getDb } = require('../database/firebase');
const { COLLECTIONS } = require('../database/collections');
const { createErrorEmbed } = require('./embeds');

class ErrorHandler {
  static async handleCommandError(error, interaction) {
    logger.error(`Command error: ${logger.formatError(error)}`);
    try {
      const embed = createErrorEmbed('Ocorreu um erro ao executar o comando.');
      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else if (interaction) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } catch (e) {
      logger.error(`Falha ao responder erro de comando: ${logger.formatError(e)}`);
    }
    await this._saveCritical(error, { type: 'command', command: interaction?.commandName });
  }

  static async handleDatabaseError(error, operation) {
    logger.error(`Database error (${operation}): ${logger.formatError(error)}`);
    await this._saveCritical(error, { type: 'database', operation });
  }

  static async handleAPIError(error, service) {
    logger.error(`API error (${service}): ${logger.formatError(error)}`);
    await this._saveCritical(error, { type: 'api', service });
  }

  static async handleValidationError(error, field) {
    logger.warn(`Validation error (${field}): ${logger.formatError(error)}`);
  }

  static async _saveCritical(error, extra = {}) {
    try {
      const db = getDb();
      const meta = Object.fromEntries(Object.entries(extra || {}).filter(([, v]) => v !== undefined));
      await db.collection(COLLECTIONS.ERRORS).add({
        message: error?.message || String(error),
        stack: error?.stack || null,
        timestamp: new Date().toISOString(),
        ...meta,
      });
    } catch (e) {
      logger.warn(`Falha ao salvar erro crítico: ${logger.formatError(e)}`);
    }
  }
}

module.exports = ErrorHandler;
