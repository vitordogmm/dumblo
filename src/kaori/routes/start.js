const interactions = require('../../events/interactionCreate');

module.exports = function registerStartRoutes(kaori) {
  // Modal: nome do personagem
  kaori.router.register(
    (i) => i.isModalSubmit && i.isModalSubmit() && i.customId.startsWith('create_character_'),
    (i, c) => interactions.handleCharacterNameSubmit(i, c)
  );

  // Modal: distribuição de atributos
  kaori.router.register(
    (i) => i.isModalSubmit && i.isModalSubmit() && i.customId.startsWith('attributes_modal_'),
    (i, c) => interactions.handleAttributesModalSubmit(i, c)
  );

  // Select menu: escolha de classe
  kaori.router.register(
    (i) => i.isStringSelectMenu && i.isStringSelectMenu() && i.customId.startsWith('class_select_'),
    (i, c) => interactions.handleClassSelection(i, c)
  );

  // Botões: confirmar classe
  kaori.router.register(
    (i) => i.isButton && i.isButton() && i.customId.startsWith('confirm_class_'),
    (i, c) => interactions.handleConfirmClass(i, c)
  );

  // Botões: voltar para select
  kaori.router.register(
    (i) => i.isButton && i.isButton() && i.customId.startsWith('back_class_select_'),
    (i, c) => interactions.handleBackToSelect(i, c)
  );
};

