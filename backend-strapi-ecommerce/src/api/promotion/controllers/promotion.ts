import { factories } from "@strapi/strapi";

export default factories.createCoreController("api::promotion.promotion", ({ strapi }) => ({
  async quote(ctx) {
    const body = (ctx.request.body ?? {}) as any;
    const items = Array.isArray(body.items) ? body.items : [];
    const coupon = String(body.coupon ?? "").trim();
    const shipping = Number(body.shipping ?? 0) || 0;

    if (!items.length) {
      return ctx.send({
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        appliedPromotions: [],
      });
    }

    const data = await strapi
      .service("api::promotion.promotion")
      .quote({ items, coupon, shipping });

    return ctx.send(data);
  },
}));
