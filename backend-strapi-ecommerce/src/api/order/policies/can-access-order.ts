import type { Core } from "@strapi/strapi";

import {
  buildOrderIdentifierFilter,
  buildOrderOwnerFilter,
  mergeFiltersWithAnd,
} from "../utils/order-utils";
import { isStoreAdmin } from "../../../utils/store-role";

const ORDER_UID = "api::order.order";

export default async (
  policyContext: any,
  _config: any,
  { strapi }: { strapi: Core.Strapi }
) => {
  const user = policyContext?.state?.user;
  const identifier = String(policyContext?.params?.id ?? "").trim();

  if (!identifier) return false;
  if (!user || isStoreAdmin(user)) return true;

  const identifierFilter = buildOrderIdentifierFilter(identifier);
  if (!identifierFilter) return false;

  const results = await strapi.documents(ORDER_UID).findMany({
    filters: mergeFiltersWithAnd(
      identifierFilter,
      buildOrderOwnerFilter(user)
    ),
    limit: 1,
    fields: ["documentId"],
  });

  return Array.isArray(results) && results.length > 0;
};
