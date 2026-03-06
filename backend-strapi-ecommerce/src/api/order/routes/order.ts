import { factories } from "@strapi/strapi";

export default factories.createCoreRouter("api::order.order", {
  config: {
    create: { auth: { scope: ["api::order.order.create"] } },
    find: { auth: { scope: ["api::order.order.find"] } },
    findOne: {
      auth: { scope: ["api::order.order.findOne"] },
      policies: ["api::order.can-access-order"],
    },
    update: {
      auth: { scope: ["api::order.order.update"] },
      policies: ["api::order.manage-order"],
    },
    delete: {
      auth: { scope: ["api::order.order.delete"] },
      policies: ["api::order.manage-order"],
    },
  },
});
