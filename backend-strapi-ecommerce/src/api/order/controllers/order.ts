import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";

import {
  asRecord,
  buildOrderOwnerFilter,
  mergeFiltersWithAnd,
} from "../utils/order-utils";
import { isStoreAdmin } from "../../../utils/store-role";

const { UnauthorizedError, ForbiddenError } = errors;

export default factories.createCoreController("api::order.order", ({ strapi }) => ({
  async find(ctx) {
    const user = ctx.state.user;

    if (!user || isStoreAdmin(user)) {
      return await super.find(ctx);
    }

    const query = asRecord(ctx.query);
    ctx.query = {
      ...query,
      filters: mergeFiltersWithAnd(query.filters, buildOrderOwnerFilter(user)),
      sort: query.sort ?? ["createdAt:desc"],
    };

    return await super.find(ctx);
  },

  /**
   * POST /api/orders
   * - Requiere login
   * - Fuerza owner (user) desde JWT
   * - Ignora cualquier user que venga del cliente
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError("Tenés que iniciar sesión para crear una orden.");
    if (isStoreAdmin(user)) {
      throw new ForbiddenError("Las cuentas tienda no pueden crear órdenes de compra.");
    }

    const created = await strapi
      .service("api::order.order")
      .createCustomerOrder(user, ctx.request.body);

    const sanitized = await this.sanitizeOutput(created, ctx);
    return this.transformResponse(sanitized);
  },

  /**
   * GET /api/orders/:id
   * - Requiere login
   * - Solo devuelve si la orden pertenece al usuario autenticado
   */
  async findOne(ctx) {
    const user = ctx.state.user;

    if (!user || isStoreAdmin(user)) {
      return await super.findOne(ctx);
    }

    const entity = await strapi.service("api::order.order").findOneForCustomer(
      user,
      ctx.params?.id,
      {
        populate: ctx.query?.populate ?? { user: true, invoices: true },
      }
    );

    if (!entity) return ctx.notFound();

    const sanitized = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitized);
  },

  /**
   * GET /api/orders/my
   * - Lista solo las órdenes del usuario autenticado
   */
  async my(ctx) {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError("No autorizado.");
    if (isStoreAdmin(user)) {
      throw new ForbiddenError("Las cuentas tienda no tienen pedidos de cliente.");
    }

    const query = asRecord(ctx.query);
    ctx.query = {
      ...query,
      filters: mergeFiltersWithAnd(query.filters, buildOrderOwnerFilter(user)),
      sort: query.sort ?? ["createdAt:desc"],
      populate: query.populate ?? "*",
    };

    return await super.find(ctx);
  },
}));
