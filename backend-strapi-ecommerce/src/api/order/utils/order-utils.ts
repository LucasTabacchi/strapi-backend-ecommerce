export type QuoteItem = {
  id: number | null;
  documentId: string | null;
  slug: string | null;
  qty: number;
};

export function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function normalizeBodyData(body: any) {
  if (!body) return {};
  return body.data && typeof body.data === "object" ? body.data : body;
}

export function isNumericIdentifier(value: string) {
  return /^\d+$/.test(String(value ?? "").trim());
}

export function isOrderNumber(value: string) {
  return /^AMG-\d+$/i.test(String(value ?? "").trim());
}

export function makeOrderNumber(numericId: number | string) {
  const value = Number(numericId);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `AMG-${String(value).padStart(4, "0")}`;
}

export function normStr(value: any) {
  return String(value ?? "").trim();
}

export function toNum(value: any, fallback = 0) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function calcShippingARS(
  baseTotal: number,
  shippingMethod: "delivery" | "pickup"
) {
  if (shippingMethod === "pickup") return 0;
  if (baseTotal > 65000) return 0;
  if (baseTotal > 40000) return 4500;
  return 9000;
}

export function buildQuoteItems(items: any[]): QuoteItem[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: Number(item?.productId ?? item?.id),
      documentId: normStr(item?.productDocumentId ?? item?.documentId) || null,
      slug: normStr(item?.slug) || null,
      qty: Math.max(1, Math.floor(Number(item?.qty ?? item?.quantity ?? 1))),
    }))
    .filter(
      (item) =>
        ((Number.isFinite(item.id) && item.id > 0) ||
          !!item.documentId ||
          !!item.slug) &&
        Number.isFinite(item.qty) &&
        item.qty > 0
    )
    .map((item) => ({
      ...item,
      id: Number.isFinite(item.id) && item.id > 0 ? item.id : null,
    }));
}

export function buildOrderOwnerFilter(user: any) {
  return { user: { id: { $eq: user.id } } };
}

export function buildOrderIdentifierFilter(identifier: string) {
  const value = normStr(identifier);

  if (!value) return null;

  if (isOrderNumber(value)) {
    return { orderNumber: { $eqi: value } };
  }

  if (isNumericIdentifier(value)) {
    return {
      $or: [
        { documentId: { $eq: value } },
        { id: { $eq: Number(value) } },
      ],
    };
  }

  return { documentId: { $eq: value } };
}

export function mergeFiltersWithAnd(
  existingFilters: unknown,
  enforcedFilter: Record<string, any>
) {
  const filters = asRecord(existingFilters);
  if (!Object.keys(filters).length) return enforcedFilter;
  return { $and: [filters, enforcedFilter] };
}
