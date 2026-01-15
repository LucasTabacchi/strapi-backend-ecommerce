export default ({ env }) => ({
  connection: {
    client: "postgres",
    connection: {
      host: env("PGHOST"),
      port: env.int("PGPORT", 5432),
      database: env("PGDATABASE"),
      user: env("PGUSER"),
      password: env("PGPASSWORD"),
      ssl: env.bool("DATABASE_SSL", true) ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: env.int("DATABASE_POOL_MIN", 0),
      max: env.int("DATABASE_POOL_MAX", 2),
    },
    acquireConnectionTimeout: env.int("DATABASE_POOL_ACQUIRE_TIMEOUT", 120000),
  },
});
