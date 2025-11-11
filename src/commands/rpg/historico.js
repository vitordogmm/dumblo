const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, time, TimestampStyles } = require('discord.js');
const { getPlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

const LUPINS_EMOJI = '<:lupins:1435488880609595485>';
const ORANGE = config.colors.primary || '#FF8C00';

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function kindMeta(entry) {
  switch (entry?.type) {
    case 'daily':
      return { dot: '🟢', sign: '+', label: 'daily', sub: 'Recompensa diária' };
    case 'deposit':
      return { dot: '🟠', sign: '↔️', label: 'depósito', sub: 'Movimento para o banco' };
    case 'withdraw':
      return { dot: '🟠', sign: '↔️', label: 'saque', sub: 'Movimento para a carteira' };
    case 'transfer_in':
      return { dot: '🟢', sign: '+', label: 'transferência recebida', sub: `De <@${entry?.from}>` };
    case 'transfer_out':
      return { dot: '🔴', sign: '-', label: 'transferência enviada', sub: `Para <@${entry?.to}>` };
    default:
      return { dot: '⚪️', sign: '·', label: 'movimento', sub: '' };
  }
}

function buildLines(entries) {
  return entries.map(e => {
    const meta = kindMeta(e);
    const when = e?.at ? time(Math.floor(new Date(e.at).getTime() / 1000), TimestampStyles.RelativeTime) : 'agora';
    const top = `${meta.dot} ${meta.sign} ${fmt(e?.amount)} ${LUPINS_EMOJI} ${when} — ${meta.label}`;
    const bottom = meta.sub || '';
    return bottom ? `${top}\n${bottom}` : top;
  }).join('\n\n');
}

function buildView(userId, fullHistory = [], page = 1) {
  const perPage = 6;
  const total = fullHistory.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * perPage;
  const slice = fullHistory.slice(start, start + perPage);

  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('📜 Extrato de Lupins')
    .setDescription(slice.length ? buildLines(slice) : 'Nenhuma transação encontrada ainda. Use `/daily` para começar!')
    .setFooter({ text: `Página ${current}/${pages}` })
    .setTimestamp();

  const firstBtn = new ButtonBuilder()
    .setCustomId(`econ_hist_nav_first_${userId}_1`)
    .setEmoji('⏮️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(current <= 1);
  const prevBtn = new ButtonBuilder()
    .setCustomId(`econ_hist_nav_prev_${userId}_${current - 1}`)
    .setEmoji('◀️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(current <= 1);
  const pageBtn = new ButtonBuilder()
    .setCustomId('econ_hist_page')
    .setLabel(`${current}/${pages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`econ_hist_nav_next_${userId}_${current + 1}`)
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(current >= pages);
  const lastBtn = new ButtonBuilder()
    .setCustomId(`econ_hist_nav_last_${userId}_${pages}`)
    .setEmoji('⏭️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(current >= pages);

  const row = new ActionRowBuilder().addComponents(firstBtn, prevBtn, pageBtn, nextBtn, lastBtn);
  return { embed, components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historico')
    .setDescription('📜 Veja seu extrato recente de transações de lupins'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      logger.info(`${interaction.user.tag} executou /historico`);

      const player = await getPlayer(userId);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const history = Array.isArray(player?.economy?.history) ? player.economy.history.slice().reverse() : [];
      const view = buildView(userId, history, 1);
      return interaction.reply({ embeds: [view.embed], components: view.components, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};
