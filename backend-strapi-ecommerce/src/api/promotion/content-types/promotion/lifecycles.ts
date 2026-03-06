import { errors } from "@strapi/utils";

import {
  normalizeProductTargetInput,
  readProductTargets,
  readStringList,
} from "../../utils/promotion-targets";

const { ValidationError } = errors;
const PRODUCT_UID = "api::product.product";
declare const strapi: any;

async function assertProductsExist(rawTargets: any, fieldName: string) {
  const { ids, documentIds } = readProductTargets(rawTargets);
  if (!ids.length && !documentIds.length) return;

  const filtersOr: any[] = [];
  if (ids.length) filtersOr.push({ id: { $in: ids } });
  if (documentIds.length) filtersOr.push({ documentId: { $in: documentIds } });

  const products = await strapi.documents(PRODUCT_UID).findMany({
    filters: filtersOr.length ? { $or: filtersOr } : {},
    fields: ["documentId"] as any,
    pagination: {
      pageSize: Math.max(ids.length + documentIds.length, 25),
    },
  });

  const existingIds = new Set<number>();
  const existingDocumentIds = new Set<string>();

  for (const product of Array.isArray(products) ? products : []) {
    const numericId = Number(product?.id);
    if (Number.isFinite(numericId) && numericId > 0) {
      existingIds.add(Math.trunc(numericId));
    }

    const documentId = String(product?.documentId ?? "").trim().toLowerCase();
    if (documentId) existingDocumentIds.add(documentId);
  }

  const missing = [
    ...ids.filter((id) => !existingIds.has(id)).map((id) => `id:${id}`),
    ...documentIds
      .filter((documentId) => !existingDocumentIds.has(documentId))
      .map((documentId) => `documentId:${documentId}`),
  ];

  if (missing.length) {
    throw new ValidationError(
      `${fieldName} contiene referencias de productos inexistentes: ${missing.join(
        ", "
      )}`
    );
  }
}

async function normalizeAndValidatePromotionData(data: any) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;

  if ("categories" in data) {
    data.categories = readStringList(data.categories);
  }

  if ("excludedCategories" in data) {
    data.excludedCategories = readStringList(data.excludedCategories);
  }

  if ("productIds" in data) {
    data.productIds = normalizeProductTargetInput(data.productIds);
    await assertProductsExist(data.productIds, "productIds");
  }

  if ("excludedProductIds" in data) {
    data.excludedProductIds = normalizeProductTargetInput(data.excludedProductIds);
    await assertProductsExist(data.excludedProductIds, "excludedProductIds");
  }
}

export default {
  async beforeCreate(event: any) {
    await normalizeAndValidatePromotionData(event?.params?.data);
  },

  async beforeUpdate(event: any) {
    await normalizeAndValidatePromotionData(event?.params?.data);
  },
};
