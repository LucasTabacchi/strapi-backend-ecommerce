// config/server.ts

export default ({ env }) => {
  const normalizeUrl = (value?: string | null) => {
    if (!value) return null;

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }

    return `https://${trimmed}`;
  };

  const isQuickTunnel = (url?: string | null) => {
    if (!url) return false;
    return url.includes("trycloudflare.com");
  };

  const allowQuickTunnel = env.bool("ALLOW_QUICK_TUNNEL_PUBLIC_URL", false);

  // 1) PUBLIC_URL
  const explicitPublicUrlRaw = normalizeUrl(env("PUBLIC_URL"));
  const explicitPublicUrl =
    !allowQuickTunnel && isQuickTunnel(explicitPublicUrlRaw)
      ? null
      : explicitPublicUrlRaw;

  // 2) URLs de plataformas (deploy)
  const fromPlatform = normalizeUrl(
    env("BACK4APP_URL") ||
      env("BACK4APP_APP_URL") ||
      env("RENDER_EXTERNAL_URL") ||
      env("RAILWAY_STATIC_URL") ||
      env("VERCEL_URL")
  );

  // 3) Fallback local (dev)
  const publicUrl = explicitPublicUrl || fromPlatform || "http://localhost:1337";

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
