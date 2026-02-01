// config/plugins.ts
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

  "users-permissions": {
    config: {
      providers: {
        google: {
          clientId: env("GOOGLE_CLIENT_ID"),
          clientSecret: env("GOOGLE_CLIENT_SECRET"),

          // ✅ REDIRECT final hacia tu FRONT
          // IMPORTANTE: setear GOOGLE_REDIRECT_URL en Render
          redirectUri: env("GOOGLE_REDIRECT_URL"),
        },
      },
    },
  },

  // ✅ GraphQL
  graphql: {
    enabled: true,
    config: {
      endpoint: "/graphql",
      shadowCRUD: true,
      playgroundAlways: true, // útil en dev (en prod también si querés)
      depthLimit: 10,
      amountLimit: 200,
    },
  },
});
