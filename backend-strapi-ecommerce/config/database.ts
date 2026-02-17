export default ({ env }) => {
  const sslEnabled = env.bool("DATABASE_SSL", true);

  return {
    connection: {
      client: "postgres",
      connection: env("DATABASE_URL")
        ? {
            connectionString: env("DATABASE_URL"),
            ssl: sslEnabled
              ? {
                  rejectUnauthorized: env.bool(
                    "DATABASE_SSL_REJECT_UNAUTHORIZED",
                    false
                  ),
                }
              : false,
          }
        : {
            host: env("PGHOST"),
            port: env.int("PGPORT", 5432),
            database: env("PGDATABASE"),
            user: env("PGUSER"),
            password: env("PGPASSWORD"),
            ssl: sslEnabled
              ? {
                  rejectUnauthorized: env.bool(
                    "DATABASE_SSL_REJECT_UNAUTHORIZED",
                    false
                  ),
                }
              : false,
          },
      pool: {
        min: env.int("DATABASE_POOL_MIN", 0),
        max: env.int("DATABASE_POOL_MAX", 1),
      },
      acquireConnectionTimeout: env.int(
        "DATABASE_POOL_ACQUIRE_TIMEOUT",
        180000
      ),
    },
  };
};
