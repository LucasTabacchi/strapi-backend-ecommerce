export default {
  routes: [
    // LISTAR (solo propias) -> filtrado en controller
    {
      method: "GET",
      path: "/addresses",
      handler: "address.find",
      config: {
        policies: [],
      },
    },

    // CREAR (user forzado en controller)
    {
      method: "POST",
      path: "/addresses",
      handler: "address.create",
      config: {
        policies: [],
      },
    },

    // VER UNA (solo si es propia)
    {
      method: "GET",
      path: "/addresses/:id",
      handler: "address.findOne",
      config: {
        policies: ["api::address.is-owner"],
      },
    },

    // EDITAR (solo si es propia)
    {
      method: "PUT",
      path: "/addresses/:id",
      handler: "address.update",
      config: {
        policies: ["api::address.is-owner"],
      },
    },

    // BORRAR (solo si es propia)
    {
      method: "DELETE",
      path: "/addresses/:id",
      handler: "address.delete",
      config: {
        policies: ["api::address.is-owner"],
      },
    },
  ],
};
