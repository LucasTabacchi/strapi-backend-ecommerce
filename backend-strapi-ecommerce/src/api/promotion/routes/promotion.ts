// backend/src/api/promotion/routes/promotion.ts

export default {
  routes: [
    // ✅ CRUD REST estándar (habilita /api/promotions, /api/promotions/:id, etc.)
    // Esto es lo que te faltaba y por eso veías 404 al listar promociones.
    {
      method: "GET",
      path: "/promotions",
      handler: "promotion.find",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/promotions/:id",
      handler: "promotion.findOne",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/promotions",
      handler: "promotion.create",
      config: { auth: false },
    },
    {
      method: "PUT",
      path: "/promotions/:id",
      handler: "promotion.update",
      config: { auth: false },
    },
    {
      method: "DELETE",
      path: "/promotions/:id",
      handler: "promotion.delete",
      config: { auth: false },
    },

    // ✅ Tu endpoint custom de quote
    {
      method: "POST",
      path: "/promotions/quote",
      handler: "promotion.quote",
      config: { auth: false },
    },
  ],
};
