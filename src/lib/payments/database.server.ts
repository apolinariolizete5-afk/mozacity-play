import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

function getClient() {
  if (client) return client;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("database_not_configured");
  client = postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return client;
}

export function paymentDatabase() {
  return getClient();
}
