export default {
  routes: [
    {
      method: "POST",
      path: "/promotions/quote",
      handler: "promotion.quote",
      config: {
        auth: false
      }
    }
  ],
};
