import { factories } from "@strapi/strapi";

type CartItemInput = { id?: number | null; documentId?: string | null; qty?: number | null };
type QuoteInput = { items?: CartItemInput[]; coupon?: string | null; shipping?: number | null };
type QuoteReasonCode =
  | "EMPTY_CART"
  | "COUPON_NOT_FOUND"
  | "COUPON_USAGE_LIMIT"
  | "COUPON_MIN_SUBTOTAL"
  | "COUPON_MIN_ITEMS"
  | "COUPON_MIN_BOXES"
  | "COUPON_NOT_APPLICABLE"
  | "COUPON_BLOCKED_BY_DISCOUNTED_ITEMS";

type QuoteLine = {
  key: string;
  id: number;
  documentId: string | null;
  qty: number;
  title: string;
  slug: string | null;
  category: string;
  unit: number;
  lineSubtotal: number;
  hasBaseDiscount: boolean;
};

type EvaluatedPromotion = {
  id: number;
  name: string;
  code: string | null;
  priority: number;
  combinable: boolean;
  stackableWithExclusive: boolean;
  amount: number;
  eligibleLines: QuoteLine[];
  eligibleSubtotal: number;
  requiresCoupon: boolean;
  meta: {
    discountType: string;
    discountValue: number;
    appliesTo: string;
  };
};

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
function uniqNums(input: any[]) {
  const out = new Set<number>();
  for (const raw of input) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out.add(Math.trunc(n));
  }
  return Array.from(out);
}

function priceWithOff(price: number, off?: number) {
  const hasOff = typeof off === "number" && off > 0;
  return hasOff ? Math.round(price * (1 - off / 100)) : price;
}

function getPromoScopeLabel(p: any) {
  const appliesTo = normStr(p?.appliesTo) || "order";
  const categories = asArray<string>(p?.categories).map(normStr).filter(Boolean);
  const productIds = uniqNums(asArray<number>(p?.productIds));

  if (appliesTo === "product") {
    if (productIds.length === 1) return "Válido para 1 producto seleccionado.";
    if (productIds.length > 1) return "Válido para productos seleccionados.";
    return "Válido para productos seleccionados.";
  }
  if (appliesTo === "category") {
    if (categories.length === 1) return `Válido para la categoría "${categories[0]}".`;
    if (categories.length > 1) return "Válido para categorías seleccionadas.";
    return "Válido para categorías seleccionadas.";
  }
  return "Válido para toda la compra.";
}

function allocateByProportion(lines: QuoteLine[], amount: number) {
  const cleanAmount = Math.max(0, Math.round(amount));
  const subtotal = Math.round(lines.reduce((acc, l) => acc + l.lineSubtotal, 0));
  const map = new Map<string, number>();

  if (!cleanAmount || !subtotal || !lines.length) return map;

  const parts = lines.map((l, idx) => {
    const exact = (cleanAmount * l.lineSubtotal) / subtotal;
    const floorVal = Math.floor(exact);
    return {
      key: l.key,
      floorVal,
      frac: exact - floorVal,
      idx,
    };
  });

  let used = parts.reduce((acc, p) => acc + p.floorVal, 0);
  let rem = cleanAmount - used;

  parts.sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (let i = 0; i < parts.length && rem > 0; i++) {
    parts[i].floorVal += 1;
    rem -= 1;
  }

  for (const p of parts) map.set(p.key, p.floorVal);
  return map;
}

function computeEligibleLines(lines: QuoteLine[], p: any) {
  const appliesTo = normStr(p?.appliesTo) || "order";
  const categories = asArray<string>(p?.categories).map(normStr).filter(Boolean);
  const excludedCategories = asArray<string>(p?.excludedCategories).map(normStr).filter(Boolean);
  const productIds = uniqNums(asArray<number>(p?.productIds));
  const excludedProductIds = uniqNums(asArray<number>(p?.excludedProductIds));

  return lines.filter((l) => {
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
}

function evaluatePromotion(
  p: any,
  input: {
    lines: QuoteLine[];
    subtotal: number;
    totalItems: number;
    totalBoxes: number;
    shipping: number;
    couponRequested: boolean;
  }
):
  | { ok: true; value: EvaluatedPromotion }
  | { ok: false; reasonCode?: QuoteReasonCode; message?: string; appliesToMessage?: string } {
  const usageLimitTotal = p?.usageLimitTotal == null ? null : num(p.usageLimitTotal, 0);
  const usedCount = num(p?.usedCount, 0);
  if (usageLimitTotal != null && usageLimitTotal > 0 && usedCount >= usageLimitTotal) {
    return {
      ok: false,
      reasonCode: "COUPON_USAGE_LIMIT",
      message: "Este cupón alcanzó su límite de uso.",
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  const minSubtotal = p?.minSubtotal == null ? null : num(p.minSubtotal, 0);
  if (minSubtotal != null && minSubtotal > 0 && input.subtotal < minSubtotal) {
    return {
      ok: false,
      reasonCode: "COUPON_MIN_SUBTOTAL",
      message: `Este cupón requiere compra mínima de $${Math.round(minSubtotal).toLocaleString("es-AR")}.`,
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  const minItems = p?.minItems == null ? null : num(p.minItems, 0);
  if (minItems != null && minItems > 0 && input.totalItems < minItems) {
    return {
      ok: false,
      reasonCode: "COUPON_MIN_ITEMS",
      message: `Este cupón requiere al menos ${Math.round(minItems)} ítems.`,
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  const minBoxes = p?.minBoxes == null ? null : num(p.minBoxes, 0);
  if (minBoxes != null && minBoxes > 0 && input.totalBoxes < minBoxes) {
    return {
      ok: false,
      reasonCode: "COUPON_MIN_BOXES",
      message: `Este cupón requiere al menos ${Math.round(minBoxes)} cajas.`,
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  if (input.couponRequested && input.lines.some((l) => l.hasBaseDiscount)) {
    return {
      ok: false,
      reasonCode: "COUPON_BLOCKED_BY_DISCOUNTED_ITEMS",
      message: "No podés aplicar cupón en carritos con productos ya rebajados.",
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  const eligibleLines = computeEligibleLines(input.lines, p);
  const eligibleSubtotal = Math.round(eligibleLines.reduce((acc, l) => acc + l.lineSubtotal, 0));
  if (!eligibleLines.length || eligibleSubtotal <= 0) {
    return {
      ok: false,
      reasonCode: "COUPON_NOT_APPLICABLE",
      message: "Este cupón no aplica a los productos de tu carrito.",
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  const discountType = normStr(p?.discountType) || "percent";
  const discountValue = num(p?.discountValue, 0);
  const maxDiscount = p?.maxDiscount == null ? null : num(p?.maxDiscount, 0);

  let amount = 0;
  if (discountType === "percent") amount = Math.round(eligibleSubtotal * (discountValue / 100));
  else if (discountType === "fixed") amount = Math.round(Math.min(discountValue, eligibleSubtotal));
  else if (discountType === "free_shipping")
    amount = Math.round(Math.min(num(input.shipping, 0), eligibleSubtotal));

  if (maxDiscount != null && maxDiscount > 0) amount = Math.min(amount, Math.round(maxDiscount));
  if (amount <= 0) {
    return {
      ok: false,
      reasonCode: "COUPON_NOT_APPLICABLE",
      message: "Este cupón no aplica a tu compra actual.",
      appliesToMessage: getPromoScopeLabel(p),
    };
  }

  return {
    ok: true,
    value: {
      id: p.id,
      name: p.name,
      code: normStr(p?.code) || null,
      priority: num(p?.priority, 100),
      combinable: !!p?.combinable,
      stackableWithExclusive: !!p?.stackableWithExclusive,
      amount,
      eligibleLines,
      eligibleSubtotal,
      requiresCoupon: !!p?.requiresCoupon,
      meta: {
        discountType,
        discountValue,
        appliesTo: normStr(p?.appliesTo) || "order",
      },
    },
  };
}

export default factories.createCoreService("api::promotion.promotion", ({ strapi }) => ({
  async quote(input: QuoteInput) {
    const nowIso = new Date().toISOString();

    const rawItems = asArray<CartItemInput>(input?.items)
      .map((it) => {
        const id = Number(it?.id);
        const documentId = normStr(it?.documentId) || null;
        const qty = Math.max(1, Math.floor(Number(it?.qty ?? 1) || 1));
        return {
          id: Number.isFinite(id) && id > 0 ? id : null,
          documentId,
          qty,
        };
      })
      .filter((it) => it.id != null || !!it.documentId);

    if (!rawItems.length) {
      return {
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        appliedPromotions: [],
        lineDiscounts: [],
        reasonCode: "EMPTY_CART",
        message: "No hay ítems para cotizar.",
        appliesToMessage: null,
        coupon: {
          requested: normStr(input?.coupon) || null,
          applied: false,
          code: null,
          reasonCode: "EMPTY_CART",
          message: "No hay ítems para cotizar.",
          appliesToMessage: null,
        },
      };
    }

    const coupon = normStr(input?.coupon);
    const shipping = num(input?.shipping, 0);

    const ids = uniqNums(rawItems.map((x) => x.id));
    const docIds = Array.from(
      new Set(rawItems.map((x) => normStr(x.documentId)).filter(Boolean))
    );

    const whereOr: any[] = [];
    if (ids.length) whereOr.push({ id: { $in: ids } });
    if (docIds.length) whereOr.push({ documentId: { $in: docIds } });

    const products = await strapi.db.query("api::product.product").findMany({
      where: whereOr.length ? { $or: whereOr } : {},
      select: ["id", "documentId", "title", "slug", "price", "off", "category"] as any,
      limit: Math.max(200, ids.length + docIds.length),
    });

    const byId = new Map<number, any>();
    const byDoc = new Map<string, any>();
    for (const p of asArray(products)) {
      if (p?.id) byId.set(p.id, p);
      const did = normStr(p?.documentId ?? p?.document_id);
      if (did) byDoc.set(did, p);
    }

    const lines = rawItems
      .map((it) => {
        const p =
          (it.id != null ? byId.get(it.id) : null) ||
          (it.documentId ? byDoc.get(normStr(it.documentId)) : null);
        if (!p) return null;

        const offRaw = num(p?.off, 0);
        const unit = priceWithOff(num(p?.price, 0), offRaw);
        const documentId = normStr(p?.documentId ?? p?.document_id) || null;
        const key = documentId ? `doc:${documentId}` : `id:${p.id}`;
        return {
          key,
          id: p.id,
          documentId,
          qty: it.qty,
          title: normStr(p?.title) || "Producto",
          slug: normStr(p?.slug) || null,
          category: normStr(p?.category),
          unit,
          lineSubtotal: Math.round(unit * it.qty),
          hasBaseDiscount: offRaw > 0,
        } as QuoteLine;
      })
      .filter(Boolean) as QuoteLine[];

    const subtotal = Math.round(lines.reduce((acc, l) => acc + l.lineSubtotal, 0));
    const totalItems = lines.reduce((acc, l) => acc + l.qty, 0);
    const totalBoxes = totalItems;

    if (!lines.length || subtotal <= 0) {
      return {
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        appliedPromotions: [],
        lineDiscounts: [],
        reasonCode: "EMPTY_CART",
        message: "No hay ítems válidos para cotizar.",
        appliesToMessage: null,
        coupon: {
          requested: coupon || null,
          applied: false,
          code: null,
          reasonCode: "EMPTY_CART",
          message: "No hay ítems válidos para cotizar.",
          appliesToMessage: null,
        },
      };
    }

    const promos = asArray(
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
        pagination: { pageSize: 300 },
      })
    );

    const context = { lines, subtotal, totalItems, totalBoxes, shipping, couponRequested: false };
    const evaluated = promos
      .map((p: any) => evaluatePromotion(p, context))
      .filter((x): x is { ok: true; value: EvaluatedPromotion } => x.ok)
      .map((x) => x.value);

    let applied: EvaluatedPromotion[] = [];
    let reasonCode: QuoteReasonCode | null = null;
    let message: string | null = null;
    let appliesToMessage: string | null = null;

    if (coupon) {
      const byCode = promos.filter(
        (p: any) => !!p?.requiresCoupon && lower(p?.code) === lower(coupon)
      );

      if (!byCode.length) {
        reasonCode = "COUPON_NOT_FOUND";
        message = "Cupón inválido o vencido.";
      } else {
        const results = byCode.map((p: any) =>
          evaluatePromotion(p, { ...context, couponRequested: true })
        );
        const valid = results
          .filter((x): x is { ok: true; value: EvaluatedPromotion } => x.ok)
          .map((x) => x.value);

        if (!valid.length) {
          const firstReject =
            results.find((x): x is { ok: false; reasonCode?: QuoteReasonCode; message?: string; appliesToMessage?: string } => !x.ok) ??
            null;
          reasonCode = firstReject?.reasonCode ?? "COUPON_NOT_APPLICABLE";
          message = firstReject?.message ?? "Este cupón no aplica a tu carrito.";
          appliesToMessage = firstReject?.appliesToMessage ?? getPromoScopeLabel(byCode[0]);
        } else {
          valid.sort((a, b) => b.amount - a.amount || a.priority - b.priority || a.id - b.id);
          applied = [valid[0]];
          appliesToMessage = getPromoScopeLabel(byCode[0]);
        }
      }
    } else {
      const exclusives = evaluated.filter((c) => !c.requiresCoupon && !c.combinable);
      const combinables = evaluated.filter((c) => !c.requiresCoupon && c.combinable);

      if (exclusives.length) {
        exclusives.sort((a, b) => b.amount - a.amount || a.priority - b.priority || a.id - b.id);
        const best = exclusives[0];
        applied.push(best);

        const stackers = combinables
          .filter((c) => c.stackableWithExclusive)
          .sort((a, b) => a.priority - b.priority || b.amount - a.amount);
        for (const c of stackers) applied.push(c);
      } else {
        combinables.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
        for (const c of combinables) applied.push(c);
      }
    }

    const effectiveApplied: EvaluatedPromotion[] = [];
    let remainingSubtotal = subtotal;
    for (const promo of applied) {
      const effectiveAmount = Math.min(Math.max(0, Math.round(promo.amount)), remainingSubtotal);
      if (effectiveAmount <= 0) continue;
      effectiveApplied.push({ ...promo, amount: effectiveAmount });
      remainingSubtotal -= effectiveAmount;
      if (remainingSubtotal <= 0) break;
    }

    const discountTotal = Math.max(0, subtotal - remainingSubtotal);
    const total = Math.max(0, subtotal - discountTotal);

    const lineAcc = new Map<string, number>();
    for (const promo of effectiveApplied) {
      const alloc = allocateByProportion(promo.eligibleLines, promo.amount);
      for (const [key, amount] of alloc.entries()) {
        lineAcc.set(key, (lineAcc.get(key) ?? 0) + amount);
      }
    }

    const lineDiscounts = lines
      .map((l) => ({
        productId: l.id,
        productDocumentId: l.documentId,
        title: l.title,
        qty: l.qty,
        amount: Math.round(lineAcc.get(l.key) ?? 0),
      }))
      .filter((l) => l.amount > 0)
      .sort((a, b) => b.amount - a.amount || a.title.localeCompare(b.title));

    const appliedPromotions = effectiveApplied.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      amount: p.amount,
      meta: p.meta,
    }));

    const couponApplied = !!coupon && effectiveApplied.some((p) => p.requiresCoupon);
    const couponCode = couponApplied
      ? effectiveApplied.find((p) => p.requiresCoupon)?.code ?? coupon
      : null;

    return {
      subtotal,
      discountTotal,
      total,
      appliedPromotions,
      lineDiscounts,
      reasonCode,
      message,
      appliesToMessage,
      coupon: {
        requested: coupon || null,
        applied: couponApplied,
        code: couponCode,
        reasonCode,
        message,
        appliesToMessage,
      },
    };
  },
}));
