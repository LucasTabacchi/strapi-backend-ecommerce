// backend/src/api/order/content-types/order/lifecycles.js
module.exports = {
  async afterCreate(event) {
    const { result } = event; // la orden creada
    const id = result.id;

    // AMG-0001, AMG-0002...
    const orderNumber = `AMG-${String(id).padStart(4, "0")}`;

    await strapi.entityService.update("api::order.order", id, {
      data: { orderNumber },
    });
  },
};
