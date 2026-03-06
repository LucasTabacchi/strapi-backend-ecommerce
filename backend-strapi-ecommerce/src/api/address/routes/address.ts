export default {
  routes: [
    // LISTAR (solo propias) -> filtrado en controller
    {
      method: "GET",
      path: "/addresses",
      handler: "address.find",
      config: {
        auth: { scope: ["api::address.address.find"] },
        policies: [],
      },
    },

    // CREAR (user forzado en controller)
    {
      method: "POST",
      path: "/addresses",
      handler: "address.create",
      config: {
        auth: { scope: ["api::address.address.create"] },
        policies: [],
      },
    },

    // VER UNA (solo si es propia)
    {
      method: "GET",
      path: "/addresses/:id",
      handler: "address.findOne",
      config: {
        auth: { scope: ["api::address.address.findOne"] },
        policies: ["api::address.is-owner"],
      },
    },

    // EDITAR (solo si es propia)
    {
      method: "PUT",
      path: "/addresses/:id",
      handler: "address.update",
      config: {
        auth: { scope: ["api::address.address.update"] },
        policies: ["api::address.is-owner"],
      },
    },

    // BORRAR (solo si es propia)
    {
      method: "DELETE",
      path: "/addresses/:id",
      handler: "address.delete",
      config: {
        auth: { scope: ["api::address.address.delete"] },
        policies: ["api::address.is-owner"],
      },
    },
  ],
};
