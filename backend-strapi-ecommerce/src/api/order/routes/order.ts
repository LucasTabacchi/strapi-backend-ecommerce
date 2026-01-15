import { factories } from "@strapi/strapi";

export default factories.createCoreRouter("api::order.order", {
  // Si querés dejar TODO habilitado, no uses only/except.
  // Acá solo hago explícito que CREATE exista y (si querés) sea público.
  config: {
    create: {
      auth: false,
    },
  },
});
