import { factories } from "@strapi/strapi";

import {
  lower,
  normStr,
  readProductTargets,
  readStringList,
  uniqNums,
} from "../utils/promotion-targets";

type CartItemInput = {
  id?: number | null;
  documentId?: string | null;
  slug?: string | null;
  qty?: number | null;
};
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

const PRODUCT_UID = "api::product.product";
const PROMOTION_UID = "api::promotion.promotion";
const ACTIVE_PROMOTIONS_CACHE_TTL_MS = 300_000;

let activePromotionsCache:
  | {
      data: any[];
      expiresAt: number;
    }
  | null = null;

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function num(v: any, def = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

function categoryTokens(category: any): string[] {
  const raw = normStr(category);
  if (!raw) return [];

  const parts = raw
    .split(/[;,|]/g)
    .map(lower)
    .filter(Boolean);

  if (!parts.length) return [lower(raw)];
  return Array.from(new Set(parts));
}

function priceWithOff(price: number, off?: number) {
  const hasOff = typeof off === "number" && off > 0;
  return hasOff ? Math.round(price * (1 - off / 100)) : price;
}

function getPromoScopeLabel(p: any) {
  const appliesTo = normStr(p?.appliesTo) || "order";
  const categories = readStringList(p?.categories);
  const productTargets = readProductTargets(p?.productIds);
  const productTargetCount = productTargets.ids.length + productTargets.documentIds.length;

  if (appliesTo === "product") {
    if (productTargetCount === 1) return "Válido para 1 producto seleccionado.";
    if (productTargetCount > 1) return "Válido para productos seleccionados.";
    return "Válido para productos seleccionados.";
  }
  if (appliesTo === "category") {
    if (categories.length === 1) return `Válido para la categoría "${categories[0]}".`;
    if (categories.length > 1) return "Válido para categorías seleccionadas.";
    return "Válido para categorías seleccionadas.";
  }
  return "Válido para toda la compra.";
}

function buildActivePromotionFilters(nowIso: string) {
  return {
    enabled: true,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: nowIso } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: nowIso } }] },
    ],
  };
}

function mapPromotionSummary(p: any, nowMs?: number) {
  const productTargets = readProductTargets(p?.productIds);
  const usageLimitTotal =
    p?.usageLimitTotal == null ? null : num(p.usageLimitTotal, 0);
  const usedCount = num(p?.usedCount, 0);
  const exhausted =
    usageLimitTotal != null && usageLimitTotal > 0 && usedCount >= usageLimitTotal;
  const startAt = p?.startAt ?? null;
  const endAt = p?.endAt ?? null;
  const startMs = startAt ? Date.parse(String(startAt)) : NaN;
  const endMs = endAt ? Date.parse(String(endAt)) : NaN;
  const isNotStarted = Number.isFinite(startMs) && nowMs != null ? startMs > nowMs : false;
  const isExpired = Number.isFinite(endMs) && nowMs != null ? endMs < nowMs : false;
  const isAvailable = !exhausted && !isNotStarted && !isExpired;

  return {
    id: p?.id,
    documentId: normStr(p?.documentId) || null,
    name: p?.name,
    description: p?.description ?? null,
    enabled: !!p?.enabled,
    requiresCoupon: !!p?.requiresCoupon,
    code: normStr(p?.code) || null,
    discountType: normStr(p?.discountType) || "percent",
    discountValue: num(p?.discountValue, 0),
    minSubtotal: p?.minSubtotal == null ? null : num(p?.minSubtotal, 0),
    minItems: p?.minItems == null ? null : num(p?.minItems, 0),
    minBoxes: p?.minBoxes == null ? null : num(p?.minBoxes, 0),
    maxDiscount: p?.maxDiscount == null ? null : num(p?.maxDiscount, 0),
    appliesTo: normStr(p?.appliesTo) || "order",
    categories: readStringList(p?.categories).map(normStr).filter(Boolean),
    productIds: productTargets.ids,
    productDocumentIds: productTargets.documentIds,
    combinable: !!p?.combinable,
    priority: num(p?.priority, 100),
    startAt,
    endAt,
    scopeLabel: getPromoScopeLabel(p),
    usageLimitTotal,
    usedCount,
    exhausted,
    isNotStarted,
    isExpired,
    isAvailable,
  };
}

async function fetchActivePromotions(strapi: any, nowIso: string) {
  const now = Date.now();
  if (activePromotionsCache && activePromotionsCache.expiresAt > now) {
    return activePromotionsCache.data;
  }

  const data = asArray(
    await strapi.documents(PROMOTION_UID).findMany({
      status: "published" as any,
      filters: buildActivePromotionFilters(nowIso),
      sort: [{ priority: "asc" }, { id: "asc" }],
      pagination: { pageSize: 300 },
    })
  );

  activePromotionsCache = {
    data,
    expiresAt: now + ACTIVE_PROMOTIONS_CACHE_TTL_MS,
  };

  return data;
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
  const categories = readStringList(p?.categories);
  const excludedCategories = readStringList(p?.excludedCategories);
  const productTargets = readProductTargets(p?.productIds);
  const excludedProductTargets = readProductTargets(p?.excludedProductIds);
  const wantedCategories = new Set(categories.map(lower));
  const blockedCategories = new Set(excludedCategories.map(lower));
  const wantedProductIds = new Set(productTargets.ids);
  const wantedProductDocumentIds = new Set(productTargets.documentIds);
  const excludedProductIds = new Set(excludedProductTargets.ids);
  const excludedProductDocumentIds = new Set(excludedProductTargets.documentIds);

  return lines.filter((l) => {
    const lineCategoryTokens = categoryTokens(l.category);
    const lineDocumentId = l.documentId ? lower(l.documentId) : "";

    if (excludedProductIds.has(l.id)) return false;
    if (lineDocumentId && excludedProductDocumentIds.has(lineDocumentId)) return false;
    if (lineCategoryTokens.some((t) => blockedCategories.has(t))) return false;

    if (appliesTo === "order") return true;
    if (appliesTo === "category") {
      if (!wantedCategories.size) return false;
      return lineCategoryTokens.some((t) => wantedCategories.has(t));
    }
    if (appliesTo === "product") {
      if (!wantedProductIds.size && !wantedProductDocumentIds.size) return false;
      if (wantedProductIds.has(l.id)) return true;
      if (lineDocumentId && wantedProductDocumentIds.has(lineDocumentId)) return true;
      return false;
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
  async listAvailablePromotions() {
    const nowIso = new Date().toISOString();
    const data = await fetchActivePromotions(strapi, nowIso);

    return data
      .map((promotion: any) => mapPromotionSummary(promotion))
      .filter((promotion) => promotion.enabled);
  },

  async listMyCoupons() {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const data = await fetchActivePromotions(strapi, nowIso);

    return data
      .filter((promotion: any) => !!promotion?.requiresCoupon)
      .map((promotion: any) => mapPromotionSummary(promotion, nowMs));
  },

  async quote(input: QuoteInput) {
    const nowIso = new Date().toISOString();

    const rawItems = asArray<CartItemInput>(input?.items)
      .map((it) => {
        const id = Number(it?.id);
        const documentId = normStr(it?.documentId) || null;
        const slug = normStr(it?.slug) || null;
        const qty = Math.max(1, Math.floor(Number(it?.qty ?? 1) || 1));
        return {
          id: Number.isFinite(id) && id > 0 ? id : null,
          documentId,
          slug,
          qty,
        };
      })
      .filter((it) => it.id != null || !!it.documentId || !!it.slug);

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
    const slugs = Array.from(new Set(rawItems.map((x) => normStr(x.slug)).filter(Boolean)));

    const whereOr: any[] = [];
    if (ids.length) whereOr.push({ id: { $in: ids } });
    if (docIds.length) whereOr.push({ documentId: { $in: docIds } });
    if (slugs.length) whereOr.push({ slug: { $in: slugs } });

    const products = await strapi.documents(PRODUCT_UID).findMany({
      status: "published" as any,
      filters: whereOr.length ? { $or: whereOr } : {},
      fields: ["documentId", "title", "slug", "price", "off", "category"] as any,
      pagination: {
        pageSize: Math.max(200, ids.length + docIds.length + slugs.length),
      },
    });

    const byId = new Map<number, any>();
    const byDoc = new Map<string, any>();
    const bySlug = new Map<string, any>();
    for (const p of asArray(products)) {
      if (p?.id) byId.set(p.id, p);
      const did = normStr(p?.documentId ?? p?.document_id);
      if (did) byDoc.set(did, p);
      const slug = normStr(p?.slug);
      if (slug) bySlug.set(slug, p);
    }

    const lines = rawItems
      .map((it) => {
        const p =
          (it.id != null ? byId.get(it.id) : null) ||
          (it.documentId ? byDoc.get(normStr(it.documentId)) : null) ||
          (it.slug ? bySlug.get(normStr(it.slug)) : null);
        if (!p) return null;

        const offRaw = num(p?.off, 0);
        const unit = priceWithOff(num(p?.price, 0), offRaw);
        const documentId = normStr(p?.documentId ?? p?.document_id) || null;
        const slug = normStr(p?.slug) || null;
        const key = documentId ? `doc:${documentId}` : p?.id ? `id:${p.id}` : `slug:${slug}`;
        return {
          key,
          id: p.id,
          documentId,
          qty: it.qty,
          title: normStr(p?.title) || "Producto",
          slug,
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

    const promos = await fetchActivePromotions(strapi, nowIso);

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
