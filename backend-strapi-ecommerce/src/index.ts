// import type { Core } from "@strapi/strapi";

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  bootstrap({ strapi } /* : { strapi: Core.Strapi } */) {
    strapi.server.app.proxy = true;
  },
};
