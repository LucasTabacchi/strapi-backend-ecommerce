module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  url: env("PUBLIC_URL"), // URL pública de Railway
  proxy: true,
  app: { keys: env.array("APP_KEYS") },
});
