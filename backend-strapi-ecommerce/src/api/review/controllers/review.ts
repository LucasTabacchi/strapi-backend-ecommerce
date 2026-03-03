/**
 * review controller
 */

import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";

const { ForbiddenError } = errors;

function isStoreAdmin(user: any) {
  return (
    user?.isStoreAdmin === true ||
    user?.isStoreAdmin === 1 ||
    user?.isStoreAdmin === "true"
  );
}

export default factories.createCoreController("api::review.review", () => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (user && isStoreAdmin(user)) {
      throw new ForbiddenError("Las cuentas tienda no pueden dejar reseñas.");
    }

    return await super.create(ctx);
  },
}));
