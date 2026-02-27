import { factories } from "@strapi/strapi";

function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function buildOwnerFilter(user: any) {
  if (user?.email) {
    return {
      $or: [
        { user: { id: { $eq: user.id } } },
        { user: { email: { $eqi: user.email } } },
      ],
    };
  }

  return { user: { id: { $eq: user.id } } };
}

export default factories.createCoreController("api::address.address", ({ strapi }) => ({
  async find(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized("Unauthorized");

    const q = asRecord(ctx.query);
    const filters = asRecord(q.filters);
    const ownerFilter = buildOwnerFilter(user);

    // Fuerza filtro: direcciones del usuario actual (compat con cuentas duplicadas por email)
    ctx.query = {
      ...q,
      filters:
        Object.keys(filters).length > 0
          ? { $and: [filters, ownerFilter] }
          : ownerFilter,
      sort: q.sort ?? ["isDefault:desc", "createdAt:desc"],
    };

    return await super.find(ctx);
  },

  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized("Unauthorized");

    // La protección real para findOne/update/delete la hace la policy is-owner
    return await super.findOne(ctx);
  },

  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized("Unauthorized");

    // Fuerza user del servidor (ignora el que venga del cliente)
    const body = asRecord(ctx.request.body);
    const data = asRecord(body.data);

    ctx.request.body = {
      ...body,
      data: {
        ...data,
        user: user.id,
      },
    };

    return await super.create(ctx);
  },
}));
