// backend/src/api/promotion/routes/promotion.ts

export default {
  routes: [
    // Endpoints custom
    {
      method: "GET",
      path: "/promotions/available",
      handler: "promotion.available",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/promotions/my-coupons",
      handler: "promotion.myCoupons",
      config: { auth: { scope: ["api::promotion.promotion.find"] } },
    },
    {
      method: "POST",
      path: "/promotions/quote",
      handler: "promotion.quote",
      config: { auth: false },
    },

    // ✅ CRUD REST estándar (habilita /api/promotions, /api/promotions/:id, etc.)
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
      config: { auth: { scope: ["api::promotion.promotion.create"] } },
    },
    {
      method: "PUT",
      path: "/promotions/:id",
      handler: "promotion.update",
      config: { auth: { scope: ["api::promotion.promotion.update"] } },
    },
    {
      method: "DELETE",
      path: "/promotions/:id",
      handler: "promotion.delete",
      config: { auth: { scope: ["api::promotion.promotion.delete"] } },
    },
  ],
};
