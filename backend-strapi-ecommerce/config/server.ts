// config/server.ts

export default ({ env }) => {
  const explicitPublicUrl = env("PUBLIC_URL");

  const fromPlatform =
    env("BACK4APP_URL") ||
    env("BACK4APP_APP_URL") ||
    env("RENDER_EXTERNAL_URL") ||
    env("RAILWAY_STATIC_URL") ||
    env("VERCEL_URL");

  const normalizeUrl = (value?: string | null) => {
    if (!value) return null;
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }
    return `https://${value}`;
  };

  const publicUrl =
    normalizeUrl(explicitPublicUrl) ||
    normalizeUrl(fromPlatform) ||
    "http://localhost:1337";

  return {
    host: env("HOST", "0.0.0.0"),
    port: env.int("PORT", 1337),
    url: publicUrl,
    proxy: true,
    app: {
      keys: env.array("APP_KEYS"),
    },
  };
};
