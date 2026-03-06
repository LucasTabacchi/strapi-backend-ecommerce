// config/plugins.ts
export default ({ env }) => {
  const isProduction = env("NODE_ENV", "development") === "production";

  return {
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
            redirectUri: env("GOOGLE_REDIRECT_URL"),
            scope: ["openid", "email", "profile"],
          },
        },
      },
    },

    graphql: {
      enabled: true,
      config: {
        endpoint: "/graphql",
        shadowCRUD: true,
        playgroundAlways: env.bool(
          "GRAPHQL_PLAYGROUND_ALWAYS",
          !isProduction
        ),
        depthLimit: env.int("GRAPHQL_DEPTH_LIMIT", 10),
        amountLimit: env.int("GRAPHQL_AMOUNT_LIMIT", 100),
        apolloServer: {
          introspection: env.bool("GRAPHQL_INTROSPECTION", !isProduction),
        },
      },
    },
  };
};
