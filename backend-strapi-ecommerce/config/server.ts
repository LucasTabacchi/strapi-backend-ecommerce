module.exports = ({ env }) => {
  const publicUrl =
    env("PUBLIC_URL") ||
    env("RENDER_EXTERNAL_URL") || // Render suele exponer esta variable
    "http://localhost:1337";

  return {
    host: env("HOST", "0.0.0.0"),
    port: env.int("PORT", 1337),
    url: publicUrl,
    proxy: true,
    app: { keys: env.array("APP_KEYS") },
  };
};
