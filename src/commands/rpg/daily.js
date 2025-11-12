const { SlashCommandBuilder, EmbedBuilder, MessageFlags, time, TimestampStyles } = require('discord.js');
const { getPlayer, updatePlayer, isBetaTester } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

const LUPINS_EMOJI = '<:lupins:1435488880609595485>';
const ORANGE = config.colors.primary || '#FF8C00';
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function computeDailyAmount(luck = 0) {
  const base = Math.floor(Math.random() * 11); // 0..10
  // Bônus leve por sorte: +1 a cada 8 pontos, máximo +3
  const bonus = clamp(Math.floor((luck || 0) / 8), 0, 3);
  return clamp(base + bonus, 0, 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('🎁 Colete seus lupins diários'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      logger.info(`${interaction.user.tag} executou /daily`);

      const player = await getPlayer(userId);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const lastIso = player?.economy?.dailyLastAt;
      const now = Date.now();
      if (lastIso) {
        const last = new Date(lastIso).getTime();
        const next = last + DAILY_COOLDOWN_MS;
        if (now < next) {
          const embed = new EmbedBuilder()
            .setColor(ORANGE)
            .setTitle('⏳ Daily ainda em cooldown')
            .setDescription(`Você já coletou hoje. Tente novamente ${time(Math.floor(next / 1000), TimestampStyles.RelativeTime)}.`)
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      }

      // Bônus Beta: +3 sorte efetiva e +10% nos lupins diários
      const isBeta = await isBetaTester(userId).catch(() => false);
      const baseLuck = player?.stats?.luck ?? 0;
      const effectiveLuck = baseLuck + (isBeta ? 3 : 0);
      const baseGained = computeDailyAmount(effectiveLuck);
      const gained = isBeta ? Math.round(baseGained * 1.10) : baseGained;
      const wallet = Number(player?.economy?.wallet?.lupins || 0) + gained;
      const history = Array.isArray(player?.economy?.history) ? player.economy.history.slice(-49) : [];
      const nowIso = new Date().toISOString();
      history.push({ type: 'daily', amount: gained, at: nowIso });

      await updatePlayer(userId, {
        economy: {
          wallet: { lupins: wallet },
          dailyLastAt: nowIso,
          history,
        },
      });

      const nextTime = new Date(Date.now() + DAILY_COOLDOWN_MS);
      const embed = new EmbedBuilder()
        .setColor(ORANGE)
        .setTitle('🎁 Daily de Lupins')
        .setDescription(`Você recebeu **${gained}** ${LUPINS_EMOJI} hoje!${isBeta ? ' (+10% Beta)' : ''}`)
        .addFields(
          { name: '🍀 Sorte', value: `${effectiveLuck}${isBeta ? ' (+3 Beta)' : ''}`, inline: true },
          { name: '👜 Carteira', value: `${wallet} ${LUPINS_EMOJI}`, inline: true },
          { name: '🔔 Próximo Daily', value: `${time(Math.floor(nextTime.getTime() / 1000), TimestampStyles.RelativeTime)}`, inline: true },
        )
        .setFooter({ text: 'Dumblo RPG' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

