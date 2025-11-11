const interactions = require('../../events/interactionCreate');

module.exports = function registerStatusRoutes(kaori) {
  // Botão: abrir modal de distribuição de pontos
  kaori.router.register(
    (i) => i.isButton && i.isButton() && i.customId.startsWith('allocate_status_'),
    (i, c) => interactions.handleAllocateStatusButton(i, c)
  );

  // Modal: submissão da distribuição de pontos
  kaori.router.register(
    (i) => i.isModalSubmit && i.isModalSubmit() && i.customId.startsWith('status_modal_'),
    (i, c) => interactions.handleStatusModalSubmit(i, c)
  );
};

