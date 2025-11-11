const { SlashCommandBuilder, time, TimestampStyles } = require('discord.js');
const { createInfoEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const { checkConnection } = require('../../database/firebase');
const config = require('../../config/config');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Exibe status e latências do bot'),
  category: 'utility',
  cooldown: 0,
  permissions: [],
  async execute(interaction, client) {
    const sentAt = Date.now();
    try {
      // Acknowledge rapidamente para evitar timeout/unknown interaction
      await interaction.deferReply();

      const apiPing = Math.round(client.ws.ping);
      const firestoreOk = await checkConnection();
      const groqOk = await client.groq.checkHealth();
      const uptimeMs = process.uptime() * 1000;
      const uptime = `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`;
      const startTimeSec = Math.floor((Date.now() - uptimeMs) / 1000);

      const botLatency = Date.now() - interaction.createdTimestamp;
      const embed = createInfoEmbed('Status do Bot 🧭', 'Diagnóstico em tempo real')
        .setColor(parseInt(config.bot.color.replace('#', ''), 16))
        .setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL() })
        .addFields(
          { name: '🏓 Latência do Bot', value: `\`${botLatency}ms\``, inline: true },
          { name: '📡 Latência da API', value: `\`${apiPing}ms\``, inline: true },
          { name: '🔥 Firestore', value: firestoreOk ? '✅ Conectado' : '❌ Desconectado', inline: true },
          { name: '🧠 Groq', value: groqOk ? '✅ Conectado' : '❌ Desconectado', inline: true },
          { name: '⏱️ Uptime', value: `${uptime} • ${time(startTimeSec, TimestampStyles.RelativeTime)}`, inline: false },
        )
        .setFooter({ text: `${config.bot.name}` });

      await interaction.editReply({ embeds: [embed] });
      logger.success(`Ping executado em ${Date.now() - sentAt}ms`);
    } catch (error) {
      logger.error(`Erro no /ping: ${logger.formatError(error)}`);
      // Resposta amigável tratada pelo ErrorHandler (ephemeral followUp)
      // Evita 'Interaction has already been acknowledged'
      try {
        const ErrorHandler = require('../../utils/errorHandler');
        await ErrorHandler.handleCommandError(error, interaction);
      } catch (e) {
        logger.error(`Erro ao enviar resposta de falha: ${logger.formatError(e)}`);
      }
    }
  },
};
