// backend/src/api/promotion/controllers/promotion.ts
import { factories } from "@strapi/strapi";

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function normStr(v: any) {
  return String(v ?? "").trim();
}
function num(v: any, def = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}
function uniqNums(input: any[]) {
  const out = new Set<number>();
  for (const raw of input) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out.add(Math.trunc(n));
  }
  return Array.from(out);
}

function scopeLabel(p: any) {
  const appliesTo = normStr(p?.appliesTo) || "order";
  const categories = asArray<string>(p?.categories).map(normStr).filter(Boolean);
  const productIds = uniqNums(asArray<number>(p?.productIds));

  if (appliesTo === "product") {
    if (productIds.length === 1) return "Válido para 1 producto seleccionado.";
    return "Válido para productos seleccionados.";
  }
  if (appliesTo === "category") {
    if (categories.length === 1) return `Válido para la categoría "${categories[0]}".`;
    return "Válido para categorías seleccionadas.";
  }
  return "Válido para toda la compra.";
}

export default factories.createCoreController("api::promotion.promotion", ({ strapi }) => ({
  // ✅ Endpoint custom: POST /api/promotions/quote
  async quote(ctx) {
    const body = (ctx.request.body ?? {}) as any;

    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw
      .map((it: any) => ({
        id: Number(it?.id),
        documentId: normStr(it?.documentId) || null,
        qty: Math.max(1, Math.floor(Number(it?.qty ?? 1))),
      }))
      .filter(
        (it: any) =>
          Number.isFinite(it.qty) &&
          it.qty > 0 &&
          ((Number.isFinite(it.id) && it.id > 0) || !!it.documentId)
      );

    const coupon = String(body.coupon ?? "").trim();
    const shipping = Number(body.shipping ?? 0);
    const shippingSafe = Number.isFinite(shipping) && shipping > 0 ? shipping : 0;

    // si no hay items válidos, devolvemos quote vacío
    if (!items.length) {
      ctx.status = 200;
      ctx.body = {
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        appliedPromotions: [],
        lineDiscounts: [],
        reasonCode: "EMPTY_CART",
        message: "No hay ítems para cotizar.",
        appliesToMessage: null,
        coupon: {
          requested: coupon || null,
          applied: false,
          code: null,
          reasonCode: "EMPTY_CART",
          message: "No hay ítems para cotizar.",
          appliesToMessage: null,
        },
      };
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

  // GET /api/promotions/available
  async available(ctx) {
    const nowIso = new Date().toISOString();
    const data = asArray(
      await strapi.entityService.findMany("api::promotion.promotion", {
        status: "published" as any,
        filters: {
          enabled: true,
          $and: [
            { $or: [{ startAt: null }, { startAt: { $lte: nowIso } }] },
            { $or: [{ endAt: null }, { endAt: { $gte: nowIso } }] },
          ],
        },
        sort: [{ priority: "asc" }, { id: "asc" }],
        pagination: { pageSize: 200 },
      })
    );

    const mapped = data
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        enabled: !!p.enabled,
        requiresCoupon: !!p.requiresCoupon,
        code: normStr(p.code) || null,
        discountType: normStr(p.discountType) || "percent",
        discountValue: num(p.discountValue, 0),
        minSubtotal: p.minSubtotal == null ? null : num(p.minSubtotal, 0),
        minItems: p.minItems == null ? null : num(p.minItems, 0),
        minBoxes: p.minBoxes == null ? null : num(p.minBoxes, 0),
        maxDiscount: p.maxDiscount == null ? null : num(p.maxDiscount, 0),
        appliesTo: normStr(p.appliesTo) || "order",
        categories: asArray<string>(p.categories).map(normStr).filter(Boolean),
        productIds: uniqNums(asArray<number>(p.productIds)),
        combinable: !!p.combinable,
        priority: num(p.priority, 100),
        startAt: p.startAt ?? null,
        endAt: p.endAt ?? null,
        scopeLabel: scopeLabel(p),
      }))
      .filter((p) => p.enabled);

    ctx.status = 200;
    ctx.body = { data: mapped };
  },

  // GET /api/promotions/my-coupons
  async myCoupons(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      ctx.body = { error: "No autorizado" };
      return;
    }

    const nowIso = new Date().toISOString();
    const data = asArray(
      await strapi.entityService.findMany("api::promotion.promotion", {
        status: "published" as any,
        filters: {
          enabled: true,
          requiresCoupon: true,
          $and: [
            { $or: [{ startAt: null }, { startAt: { $lte: nowIso } }] },
            { $or: [{ endAt: null }, { endAt: { $gte: nowIso } }] },
          ],
        },
        sort: [{ priority: "asc" }, { id: "asc" }],
        pagination: { pageSize: 200 },
      })
    );

    const mapped = data
      .map((p: any) => {
        const usageLimitTotal = p?.usageLimitTotal == null ? null : num(p.usageLimitTotal, 0);
        const usedCount = num(p?.usedCount, 0);
        const exhausted = usageLimitTotal != null && usageLimitTotal > 0 && usedCount >= usageLimitTotal;
        return {
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          code: normStr(p.code) || null,
          discountType: normStr(p.discountType) || "percent",
          discountValue: num(p.discountValue, 0),
          minSubtotal: p.minSubtotal == null ? null : num(p.minSubtotal, 0),
          minItems: p.minItems == null ? null : num(p.minItems, 0),
          minBoxes: p.minBoxes == null ? null : num(p.minBoxes, 0),
          maxDiscount: p.maxDiscount == null ? null : num(p.maxDiscount, 0),
          appliesTo: normStr(p.appliesTo) || "order",
          categories: asArray<string>(p.categories).map(normStr).filter(Boolean),
          productIds: uniqNums(asArray<number>(p.productIds)),
          combinable: !!p.combinable,
          priority: num(p.priority, 100),
          startAt: p.startAt ?? null,
          endAt: p.endAt ?? null,
          scopeLabel: scopeLabel(p),
          usageLimitTotal,
          usedCount,
          exhausted,
        };
      })
      .filter((p) => !p.exhausted);

    ctx.status = 200;
    ctx.body = {
      data: mapped,
      meta: {
        userId: user.id,
      },
    };
  },
}));
