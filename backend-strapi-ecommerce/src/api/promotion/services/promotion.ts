import { factories } from "@strapi/strapi";

type CartItemInput = { id?: number; documentId?: string; qty: number };
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

function pickAttr(row: any) {
  return row?.attributes ?? row ?? {};
}
function pickDocumentId(row: any): string | null {
  const attr = pickAttr(row);
  const v =
    row?.documentId ??
    row?.attributes?.documentId ??
    row?.attributes?.document_id ??
    attr?.documentId ??
    attr?.document_id ??
    null;
  const s = v != null ? String(v).trim() : "";
  return s ? s : null;
}

function priceWithOff(price: number, off?: number) {
  const hasOff = typeof off === "number" && off > 0;
  return hasOff ? Math.round(price * (1 - off / 100)) : price;
}

export default factories.createCoreService("api::promotion.promotion", ({ strapi }) => ({
  async quote(input: QuoteInput) {
    const now = new Date();

    // 1) Normalizar items
    const rawItems = asArray<CartItemInput>(input.items)
      .map((it) => ({
        id: Number.isFinite(Number(it.id)) ? Number(it.id) : null,
        documentId: normStr((it as any)?.productDocumentId ?? it.documentId) || null,
        qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      }))
      .filter((it) => (it.id && it.id > 0) || !!it.documentId);

    if (!rawItems.length) {
      return { subtotal: 0, discountTotal: 0, total: 0, appliedPromotions: [] };
    }

    // 2) Traer productos reales desde Strapi por id y/o documentId
    const ids = Array.from(new Set(rawItems.map((x) => x.id).filter((x): x is number => !!x)));
    const docIds = Array.from(new Set(rawItems.map((x) => x.documentId).filter((x): x is string => !!x)));

    const productsA = ids.length
      ? await strapi.entityService.findMany("api::product.product", {
          filters: { id: { $in: ids } },
          pagination: { pageSize: Math.max(100, ids.length) },
        })
      : [];

    const productsB = docIds.length
      ? await strapi.entityService.findMany("api::product.product", {
          // En v5 existe documentId; si estás en v4, docIds normalmente va a venir vacío
          filters: { documentId: { $in: docIds } } as any,
          pagination: { pageSize: Math.max(100, docIds.length) },
        })
      : [];

    const products = [...asArray(productsA), ...asArray(productsB)];

    const byId = new Map<number, any>();
    const byDoc = new Map<string, any>();
    for (const p of asArray(products)) {
      if (Number.isFinite(p?.id)) byId.set(p.id, p);
      const d = pickDocumentId(p);
      if (d) byDoc.set(d, p);
    }

    const lines = rawItems
      .map((it) => {
        const p = it.id ? byId.get(it.id) : it.documentId ? byDoc.get(it.documentId) : null;
        if (!p) return null;

        const offVal =
          typeof p.off === "number" ? p.off : p.off != null ? Number(p.off) : undefined;

        const unit = priceWithOff(num(p.price, 0), offVal);
        const lineSubtotal = unit * it.qty;

        return {
          id: p.id,
          documentId: pickDocumentId(p),
          qty: it.qty,
          title: p.title,
          slug: p.slug,
          category: p.category,
          unit,
          lineSubtotal,
        };
      })
      .filter(Boolean) as any[];

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

    // 4) Candidatas (igual que antes)
    const candidates = asArray(promos)
      .map((p: any) => {
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
        };
      })
      .filter(Boolean) as any[];

    // 5) Tu regla: si hay cupón, NO combinar con otras
    const couponApplied = candidates.find((c) => !!c.code);
    if (coupon && couponApplied) {
      const discountTotal = Math.min(couponApplied.amount, subtotal);
      return {
        subtotal,
        discountTotal,
        total: subtotal - discountTotal,
        appliedPromotions: [{
          id: couponApplied.id,
          name: couponApplied.name,
          code: couponApplied.code,
          amount: couponApplied.amount,
          meta: couponApplied.meta,
        }],
      };
    }

    // (resto igual)
    const exclusives = candidates.filter((c) => !c.combinable);
    const combinables = candidates.filter((c) => c.combinable);

    let applied: any[] = [];
    let discountTotal = 0;

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
