export default {
  routes: [
    {
      method: "GET",
      path: "/orders/my",
      handler: "order.my",
      config: {
        auth: { scope: ["api::order.order.find"] },
      },
    },
  ],
};
