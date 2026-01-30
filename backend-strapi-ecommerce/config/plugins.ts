// config/plugins.js
module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        cloud_name: env("CLOUDINARY_NAME"),
        api_key: env("CLOUDINARY_API_KEY"),
        api_secret: env("CLOUDINARY_API_SECRET"),
      },
      actionOptions: {
        upload: {},
        delete: {},
      },
    },
  },

  // ✅ Google OAuth (Users & Permissions)
  "users-permissions": {
    config: {
      providers: {
        google: {
          clientId: env("GOOGLE_CLIENT_ID"),
          clientSecret: env("GOOGLE_CLIENT_SECRET"),

          // ✅ IMPORTANTE: la key correcta es "redirect"
          // Es a dónde vuelve Strapi DESPUÉS de Google (tu front)
          redirect: env(
            "GOOGLE_REDIRECT_URL",
            "http://localhost:3000/connect/google/redirect"
          ),
        },
      },
    },
  },
});
