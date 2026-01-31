import { factories } from "@strapi/strapi";

export default factories.createCoreRouter("api::order.order", {
  config: {
    // ✅ Crear orden SOLO logueado
    create: {
      auth: true,
    },

    // (Opcional recomendado) Proteger find y findOne también.
    // Si en tu front usás solo /orders/my, podés dejar find deshabilitado desde roles.
    find: { auth: true },
    findOne: { auth: true },
    update: { auth: true },
    delete: { auth: true },
  },

  routes: [
    // ✅ Custom endpoint: GET /api/orders/my
    {
      method: "GET",
      path: "/orders/my",
      handler: "order.my",
      config: {
        auth: true,
      },
    },
  ],
});
