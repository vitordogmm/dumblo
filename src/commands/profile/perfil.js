const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getPlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const config = require('../../config/config');
const classes = require('../../data/classes.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('👤 Veja apenas seus itens equipados (arma, armadura e consumível)'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const player = await getPlayer(interaction.user.id);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const cls = classes[player.classId];
      const equippedWeapon = player.gear?.weapon?.name || 'Nenhum';
      const equippedArmor = player.gear?.armor?.name || 'Nenhuma';
      const equippedConsumable = player.gear?.consumable?.name || 'Nenhum';

      const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || '#5865F2')
        .setTitle(`👤 Equipados de ${player.name}`)
        .addFields(
          { name: '🏷️ Classe', value: cls ? `${cls.emoji} ${cls.name}` : (player.classId || 'Desconhecida'), inline: true },
          { name: '⚔️ Arma', value: equippedWeapon, inline: true },
          { name: '🛡️ Armadura', value: equippedArmor, inline: true },
          { name: '🧪 Consumível (Slot 1)', value: equippedConsumable, inline: true },
          { name: 'ℹ️ Dica', value: 'Para ver o inventário completo e equipar itens, use `/inventario`.', inline: false },
        )
        .setFooter({ text: 'Dumblo RPG' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

