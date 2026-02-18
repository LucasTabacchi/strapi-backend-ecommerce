// config/middlewares.ts
export default ({ env }) => [
  "strapi::errors",
  "strapi::security",
  {
    name: "strapi::cors",
    config: {
      origin: env.array("CORS_ORIGINS", ["http://localhost:3000"]),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      headers: ["Content-Type", "Authorization"],
      credentials: true,
    },
  },
  "strapi::poweredBy",
  "strapi::logger",
  "strapi::query",
  "strapi::body",

  {
    name: "strapi::session",
    config: {
      proxy: true,
      cookie: {
        // ✅ local: false (HTTP)
        // ✅ prod: true (HTTPS)
        secure: env.bool("COOKIE_SECURE", false),
        sameSite: env.bool("COOKIE_SECURE", false) ? "none" : "lax",
      },
    },
  },

  "strapi::favicon",
  "strapi::public",
];
