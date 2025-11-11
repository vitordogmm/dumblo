const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, userMention } = require('discord.js');
const { getPlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

const LUPINS_EMOJI = '<:lupins:1435488880609595485>';
const ORANGE = config.colors.primary || '#FF8C00';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transferir')
    .setDescription('🤝 Transferir lupins para outro usuário')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuário destino').setRequired(true))
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Quantidade para transferir').setMinValue(1).setRequired(true)),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const senderId = interaction.user.id;
      const targetUser = interaction.options.getUser('usuario', true);
      const amount = interaction.options.getInteger('quantidade', true);
      logger.info(`${interaction.user.tag} executou /transferir ${amount} para ${targetUser.tag}`);

      if (targetUser.bot) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Usuário inválido')
          .setDescription('Não é possível transferir lupins para bots.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (targetUser.id === senderId) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Transferência inválida')
          .setDescription('Você não pode transferir para si mesmo. Se deseja mover entre carteira e banco, use `/depositar` ou `/sacar`.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const sender = await getPlayer(senderId);
      if (!sender) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const receiver = await getPlayer(targetUser.id);
      if (!receiver) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Usuário inválido')
          .setDescription('O usuário destino ainda não possui personagem em Dumblo.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const wallet = Number(sender?.economy?.wallet?.lupins || 0);
      if (amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Valor inválido')
          .setDescription('Informe uma quantidade positiva para transferir.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      if (wallet < amount) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Saldo insuficiente')
          .setDescription(`Você tem **${wallet}** ${LUPINS_EMOJI} na carteira, mas quer transferir **${amount}**.`)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(ORANGE)
        .setTitle('Confirmar Transferência')
        .setDescription(`Deseja transferir **${amount}** ${LUPINS_EMOJI} para ${userMention(targetUser.id)}?`)
        .addFields(
          { name: '👤 De', value: `${userMention(senderId)} (Carteira: ${wallet} ${LUPINS_EMOJI} → ${wallet - amount} ${LUPINS_EMOJI})`, inline: false },
          { name: '👤 Para', value: `${userMention(targetUser.id)}`, inline: false },
        )
        .setFooter({ text: 'Dumblo RPG' })
        .setTimestamp();

      const confirmBtn = new ButtonBuilder()
        .setCustomId(`econ_transfer_confirm_${senderId}_${targetUser.id}_${amount}`)
        .setLabel('✅ Confirmar')
        .setStyle(ButtonStyle.Success);
      const cancelBtn = new ButtonBuilder()
        .setCustomId(`econ_transfer_cancel_${senderId}`)
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};
