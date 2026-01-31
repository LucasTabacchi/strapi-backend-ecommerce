export default {
  async beforeCreate(event) {
    const { params, state } = event;

    // ✅ Si querés checkout SOLO logueados:
    const user = state?.user;
    if (!user) {
      throw new Error("No autorizado: tenés que iniciar sesión para crear una orden.");
    }

    // 🔒 Ignoramos cualquier "user" que venga del body
    if (params?.data?.user) {
      delete params.data.user;
    }

    // ✅ Forzamos el dueño desde el JWT
    params.data.user = user.id;
  },

  async afterCreate(event) {
    const { result } = event;

    // En v5, result suele traer id (numérico)
    const id = result?.id;
    if (!id) return;

    // AMG-0001, AMG-0002...
    const orderNumber = `AMG-${String(id).padStart(4, "0")}`;

    // Evitamos re-escribir si ya está seteado
    if (result?.orderNumber === orderNumber) return;

    // ✅ Strapi v5 entityService.update(uid, entityId, { data })
    await strapi.entityService.update("api::order.order", id, {
      data: { orderNumber },
    });
  },
};
