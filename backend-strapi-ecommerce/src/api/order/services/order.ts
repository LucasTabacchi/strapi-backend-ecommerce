import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";

import {
  buildOrderIdentifierFilter,
  buildOrderOwnerFilter,
  buildQuoteItems,
  calcShippingARS,
  makeOrderNumber,
  mergeFiltersWithAnd,
  normStr,
  normalizeBodyData,
  toNum,
} from "../utils/order-utils";

const { ValidationError } = errors;
const ORDER_UID = "api::order.order";

export default factories.createCoreService(ORDER_UID, ({ strapi }) => ({
  async createCustomerOrder(user: any, body: any) {
    const incoming = normalizeBodyData(body);
    const data = { ...incoming };

    delete data.user;
    delete data.orderNumber;
    delete data.total;
    delete data.subtotal;
    delete data.discountTotal;
    delete data.appliedPromotions;

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new ValidationError("La orden debe incluir items.");
    }

    const quoteItems = buildQuoteItems(data.items);
    if (!quoteItems.length) {
      throw new ValidationError(
        "Los items no tienen productId/documentId/slug válidos."
      );
    }

    const couponRequested = normStr(incoming?.coupon) || null;
    const quote = await strapi.service("api::promotion.promotion").quote({
      items: quoteItems,
      coupon: couponRequested,
      shipping: 0,
    });

    const subtotal = Math.round(toNum(quote?.subtotal, 0));
    const discountTotal = Math.round(toNum(quote?.discountTotal, 0));
    const promoTotal = Math.round(
      toNum(quote?.total, subtotal - discountTotal)
    );

    if (
      !Number.isFinite(subtotal) ||
      subtotal <= 0 ||
      !Number.isFinite(promoTotal) ||
      promoTotal < 0
    ) {
      throw new ValidationError(
        "No se pudo calcular un total válido para la orden."
      );
    }

    const shippingMethod =
      normStr(data?.shippingMethod) === "pickup" ? "pickup" : "delivery";
    const shippingCost = calcShippingARS(promoTotal, shippingMethod);
    const total = Math.max(0, promoTotal + shippingCost);

    const created = await strapi.documents(ORDER_UID).create({
      data: {
        ...data,
        shippingMethod,
        shippingCost,
        subtotal,
        discountTotal,
        appliedPromotions: Array.isArray(quote?.appliedPromotions)
          ? quote.appliedPromotions
          : [],
        coupon:
          quote?.coupon?.applied === true
            ? quote?.coupon?.code ?? couponRequested
            : null,
        total,
        user: user.id,
      },
      populate: {
        user: true,
        invoices: true,
      },
    });

    const orderNumber = makeOrderNumber(created?.id);
    if (!orderNumber || !created?.documentId || created?.orderNumber) {
      return created;
    }

    try {
      return await strapi.documents(ORDER_UID).update({
        documentId: created.documentId,
        data: { orderNumber },
        populate: {
          user: true,
          invoices: true,
        },
      });
    } catch (error: any) {
      strapi.log.warn(
        `[order.createCustomerOrder] No pude setear orderNumber para documentId=${created?.documentId}: ${
          error?.message || error
        }`
      );

      return created;
    }
  },

  async findOneForCustomer(user: any, identifier: string, params: Record<string, any> = {}) {
    const identifierFilter = buildOrderIdentifierFilter(identifier);
    if (!identifierFilter) return null;

    const filters = mergeFiltersWithAnd(identifierFilter, buildOrderOwnerFilter(user));
    const results = await strapi.documents(ORDER_UID).findMany({
      ...params,
      filters,
      limit: 1,
    });

    return Array.isArray(results) ? results[0] ?? null : null;
  },
}));
