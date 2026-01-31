export default {
  async afterCreate(event) {
    const { result } = event;

    const id = result?.id;
    if (!id) return;

    const orderNumber = `AMG-${String(id).padStart(4, "0")}`;

    // Evitamos re-escribir si ya está seteado
    if (result?.orderNumber === orderNumber) return;

    await strapi.entityService.update("api::order.order", id, {
      data: { orderNumber },
    });
  },
};
