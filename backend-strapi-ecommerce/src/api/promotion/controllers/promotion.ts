// backend/src/api/promotion/controllers/promotion.ts
import { factories } from "@strapi/strapi";

export default factories.createCoreController("api::promotion.promotion", ({ strapi }) => ({
  // ✅ Endpoint custom: POST /api/promotions/quote
  async quote(ctx) {
    const body = (ctx.request.body ?? {}) as any;

    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw
      .map((it: any) => ({
        id: Number(it?.id),
        qty: Math.max(1, Math.floor(Number(it?.qty ?? 1))),
      }))
      .filter((it: any) => Number.isFinite(it.id) && it.id > 0 && Number.isFinite(it.qty) && it.qty > 0);

    const coupon = String(body.coupon ?? "").trim();
    const shipping = Number(body.shipping ?? 0);
    const shippingSafe = Number.isFinite(shipping) && shipping > 0 ? shipping : 0;

    // si no hay items válidos, devolvemos quote vacío
    if (!items.length) {
      ctx.status = 200;
      ctx.body = { subtotal: 0, discountTotal: 0, total: 0, appliedPromotions: [] };
      return;
    }

    try {
      const data = await strapi
        .service("api::promotion.promotion")
        .quote({ items, coupon, shipping: shippingSafe });

      ctx.status = 200;
      ctx.body = data;
    } catch (e: any) {
      strapi.log.error("[promotions.quote] error:", e);
      ctx.status = 500;
      ctx.body = { error: e?.message || "Error calculando promociones" };
    }
  },
}));
