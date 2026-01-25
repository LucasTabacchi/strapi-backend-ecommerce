import { factories } from "@strapi/strapi";

type CartItemInput = { id?: number | string | null; documentId?: string | null; qty: number };
type QuoteInput = { items: CartItemInput[]; coupon?: string; shipping?: number };

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function num(v: any, def = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}
function normStr(s: any) {
  return String(s ?? "").trim();
}
function lower(s: any) {
  return normStr(s).toLowerCase();
}

function priceWithOff(price: number, off?: number) {
  const hasOff = typeof off === "number" && off > 0;
  return hasOff ? Math.round(price * (1 - off / 100)) : price;
}

// ✅ soporta entityService plano (v4/v5) y también { id, attributes } (REST-shape)
function unwrapEntity(p: any) {
  if (!p) return null;
  if (p.attributes && typeof p.attributes === "object") {
    return { id: p.id, documentId: (p as any).documentId ?? p.attributes.documentId, ...p.attributes };
  }
  return p;
}

function catName(p: any) {
  const c = p?.category;
  // puede venir como relación { name } o como string o null
  return String(c?.name ?? c ?? "").trim();
}

export default factories.createCoreService("api::promotion.promotion", ({ strapi }) => ({
  async quote(input: QuoteInput) {
    const now = new Date();

    // 1) Normalizar items (acepta id o documentId)
    const rawItems = asArray<CartItemInput>(input.items)
      .map((it) => {
        const idNum = Number(it?.id);
        const documentId = normStr(it?.documentId) || null;
        const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
        return {
          id: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
          documentId,
          qty,
        };
      })
      .filter((it) => it.id != null || !!it.documentId);

    if (!rawItems.length) {
      return { subtotal: 0, discountTotal: 0, total: 0, appliedPromotions: [] };
    }

    // 2) Traer productos reales (por id OR documentId)
    const ids = Array.from(new Set(rawItems.map((x) => x.id).filter((x): x is number => x != null)));
    const docIds = Array.from(new Set(rawItems.map((x) => x.documentId).filter((x): x is string => !!x)));

    // ✅ Importante: NO poner relaciones en fields. Category va por populate.
    const products = await strapi.entityService.findMany("api::product.product", {
      filters:
        ids.length || docIds.length
          ? {
              $or: [
                ...(ids.length ? [{ id: { $in: ids } }] : []),
                ...(docIds.length ? [{ documentId: { $in: docIds } }] : []),
              ],
            }
          : undefined,
      fields: ["title", "price", "off", "slug"] as any,
      populate: { category: { fields: ["name"] } } as any,
      pagination: { pageSize: 200 },
    });

    const byId = new Map<number, any>();
    const byDoc = new Map<string, any>();

    for (const raw of asArray(products)) {
      const p = unwrapEntity(raw);
      if (!p) continue;

      if (p.id) byId.set(Number(p.id), p);

      const did = normStr((p as any)?.documentId ?? (p as any)?.document_id);
      if (did) byDoc.set(did, p);
    }

    const lines = rawItems
      .map((it) => {
        const p =
          (it.id != null ? byId.get(it.id) : null) ||
          (it.documentId ? byDoc.get(it.documentId) : null);

        if (!p) return null;

        const unit = priceWithOff(num(p.price, 0), num(p.off, 0));
        const lineSubtotal = unit * it.qty;

        return {
          id: Number(p.id),
          documentId: normStr((p as any)?.documentId) || null,
          qty: it.qty,
          title: p.title,
          slug: p.slug,
          category: catName(p),
          unit,
          lineSubtotal,
        };
      })
      .filter(Boolean) as any[];

    // ✅ si no encontró productos, subtotal queda 0 -> eso te rompe cupones
    if (!lines.length) {
      return { subtotal: 0, discountTotal: 0, total: 0, appliedPromotions: [] };
    }

    const subtotal = Math.round(lines.reduce((acc, l) => acc + l.lineSubtotal, 0));
    const totalItems = lines.reduce((acc, l) => acc + l.qty, 0);
    const totalBoxes = totalItems;

    // 3) Promos activas
    const coupon = normStr(input.coupon);
    const shipping = num(input.shipping, 0);

    const promos = await strapi.entityService.findMany("api::promotion.promotion", {
      filters: {
        enabled: true,
        publishedAt: { $notNull: true },
        $and: [
          { $or: [{ startAt: null }, { startAt: { $lte: now.toISOString() } }] },
          { $or: [{ endAt: null }, { endAt: { $gte: now.toISOString() } }] },
        ],
      },
      sort: [{ priority: "asc" }, { id: "asc" }],
      pagination: { pageSize: 200 },
    });

    // 4) Evaluar promos
    const candidates = asArray(promos)
      .map((rawP: any) => {
        const p = unwrapEntity(rawP) ?? rawP;

        const requiresCoupon = !!p.requiresCoupon;
        const code = normStr(p.code);

        if (requiresCoupon) {
          if (!coupon) return null;
          if (lower(coupon) !== lower(code)) return null;
        }

        const usageLimitTotal = p.usageLimitTotal == null ? null : num(p.usageLimitTotal, 0);
        const usedCount = num(p.usedCount, 0);
        if (usageLimitTotal != null && usageLimitTotal > 0 && usedCount >= usageLimitTotal) return null;

        const minSubtotal = p.minSubtotal == null ? null : num(p.minSubtotal, 0);
        if (minSubtotal != null && minSubtotal > 0 && subtotal < minSubtotal) return null;

        const minItems = p.minItems == null ? null : num(p.minItems, 0);
        if (minItems != null && minItems > 0 && totalItems < minItems) return null;

        const minBoxes = p.minBoxes == null ? null : num(p.minBoxes, 0);
        if (minBoxes != null && minBoxes > 0 && totalBoxes < minBoxes) return null;

        const appliesTo = normStr(p.appliesTo) || "order";

        const categories = asArray<string>(p.categories);
        const excludedCategories = asArray<string>(p.excludedCategories);

        const productIds = asArray<number>(p.productIds).map(Number).filter(Number.isFinite);
        const excludedProductIds = asArray<number>(p.excludedProductIds).map(Number).filter(Number.isFinite);

        const eligibleLines = lines.filter((l) => {
          if (excludedProductIds.includes(l.id)) return false;
          if (excludedCategories.map(lower).includes(lower(l.category))) return false;

          if (appliesTo === "order") return true;

          if (appliesTo === "category") {
            if (!categories.length) return false;
            return categories.map(lower).includes(lower(l.category));
          }

          if (appliesTo === "product") {
            if (!productIds.length) return false;
            return productIds.includes(l.id);
          }

          return true;
        });

        const eligibleSubtotal = Math.round(eligibleLines.reduce((acc, l) => acc + l.lineSubtotal, 0));
        if (eligibleSubtotal <= 0) return null;

        const discountType = normStr(p.discountType) || "percent";
        const discountValue = num(p.discountValue, 0);
        const maxDiscount = p.maxDiscount == null ? null : num(p.maxDiscount, 0);

        let amount = 0;
        if (discountType === "percent") amount = Math.round(eligibleSubtotal * (discountValue / 100));
        else if (discountType === "fixed") amount = Math.round(Math.min(discountValue, eligibleSubtotal));
        else if (discountType === "free_shipping") amount = Math.round(Math.min(shipping, eligibleSubtotal));

        if (maxDiscount != null && maxDiscount > 0) amount = Math.min(amount, Math.round(maxDiscount));
        if (amount <= 0) return null;

        return {
          id: p.id,
          name: p.name,
          code: code || null,
          priority: num(p.priority, 100),
          combinable: !!p.combinable,
          stackableWithExclusive: !!p.stackableWithExclusive,
          amount,
          meta: { discountType, discountValue, appliesTo },
          requiresCoupon,
        };
      })
      .filter(Boolean) as any[];

    // 5) Regla: si hay cupón válido => NO sumar otras
    let applied: any[] = [];
    let discountTotal = 0;

    const couponCandidates = candidates.filter((c) => c.requiresCoupon);
    if (coupon && couponCandidates.length) {
      couponCandidates.sort((a, b) => b.amount - a.amount || a.priority - b.priority || a.id - b.id);
      applied = [couponCandidates[0]];
      discountTotal = couponCandidates[0].amount;
    } else {
      const exclusives = candidates.filter((c) => !c.combinable);
      const combinables = candidates.filter((c) => c.combinable);

      if (exclusives.length) {
        exclusives.sort((a, b) => b.amount - a.amount || a.priority - b.priority || a.id - b.id);
        const best = exclusives[0];
        applied.push(best);
        discountTotal += best.amount;

        const stackers = combinables.filter((c) => c.stackableWithExclusive);
        stackers.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
        for (const c of stackers) {
          applied.push(c);
          discountTotal += c.amount;
        }
      } else {
        combinables.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
        for (const c of combinables) {
          applied.push(c);
          discountTotal += c.amount;
        }
      }
    }

    discountTotal = Math.min(discountTotal, subtotal);
    const total = subtotal - discountTotal;

    return {
      subtotal,
      discountTotal,
      total,
      appliedPromotions: applied.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        amount: p.amount,
        meta: p.meta,
      })),
    };
  },
}));
