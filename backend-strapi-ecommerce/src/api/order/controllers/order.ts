import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";

const { UnauthorizedError, ForbiddenError, ValidationError } = errors;

function normalizeBodyData(body: any) {
  if (!body) return {};
  // Acepta tanto { data: {...} } como {...}
  return body.data && typeof body.data === "object" ? body.data : body;
}

function getOwnerId(maybeUser: any) {
  if (!maybeUser) return null;
  if (typeof maybeUser === "number") return maybeUser;
  if (typeof maybeUser === "string") {
    const n = Number(maybeUser);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof maybeUser === "object") {
    const id = (maybeUser as any).id;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default factories.createCoreController("api::order.order", ({ strapi }) => ({
  /**
   * POST /api/orders
   * - Requiere login
   * - Fuerza owner (user) desde JWT
   * - Ignora cualquier user que venga del cliente
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError("Tenés que iniciar sesión para crear una orden.");

    const data = normalizeBodyData(ctx.request.body);

    // 🔒 Nunca confiar en el cliente para setear el user
    if (data?.user) delete data.user;

    // (opcional) validación mínima para errores más claros
    if (!data?.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new ValidationError("La orden debe incluir items.");
    }
    if (data?.total == null) {
      throw new ValidationError("La orden debe incluir total.");
    }

    const entity = await strapi.entityService.create("api::order.order", {
      data: {
        ...data,
        user: user.id,
      },
      populate: { user: true, invoices: true },
    });

    return { data: entity };
  },

  /**
   * GET /api/orders/:id
   * - Requiere login
   * - Solo devuelve si la orden pertenece al usuario autenticado
   */
  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError("No autorizado.");

    const { id } = ctx.params;

    const entity: any = await strapi.entityService.findOne("api::order.order", id, {
      populate: { user: true, invoices: true },
    });

    if (!entity) return ctx.notFound();

    const ownerId = getOwnerId(entity.user);
    if (!ownerId || Number(ownerId) !== Number(user.id)) {
      throw new ForbiddenError("No tenés permiso para ver esta orden.");
    }

    return { data: entity };
  },

  /**
   * GET /api/orders/my
   * - Lista solo las órdenes del usuario autenticado
   */
  async my(ctx) {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError("No autorizado.");

    const entities = await strapi.entityService.findMany("api::order.order", {
      filters: { user: user.id },
      sort: { createdAt: "desc" },
      populate: { user: true, invoices: true },
    });

    return { data: entities };
  },
}));
