import { factories } from "@strapi/strapi";

export default factories.createCoreRouter("api::order.order", {
  config: {
    create: {
      auth: { scope: ["api::order.order.create"] },
    },
    find: {
      auth: { scope: ["api::order.order.find"] },
    },
    findOne: {
      auth: { scope: ["api::order.order.findOne"] },
    },
    update: {
      auth: { scope: ["api::order.order.update"] },
    },
    delete: {
      auth: { scope: ["api::order.order.delete"] },
    },
  },

  routes: [
    {
      method: "GET",
      path: "/orders/my",
      handler: "order.my",
      config: {
        auth: { scope: ["api::order.order.find"] },
      },
    },
  ],
});
