import type { Core } from "@strapi/strapi";

export default async (policyContext: any, _config: any, { strapi }: { strapi: Core.Strapi }) => {
  const ctx = policyContext;

  const user = ctx.state.user; // users-permissions
  if (!user) return false;

  const documentId = ctx.params?.id;
  if (!documentId) return false;

  const ownerFilter = user?.email
    ? {
        $or: [
          { user: { id: { $eq: user.id } } },
          { user: { email: { $eqi: user.email } } },
        ],
      }
    : { user: { id: { $eq: user.id } } };

  // Buscamos la address por documentId y user id
  const results = await strapi.documents("api::address.address").findMany({
    filters: { $and: [{ documentId: { $eq: documentId } }, ownerFilter] },
    limit: 1,
  });

  return Array.isArray(results) && results.length > 0;
};
