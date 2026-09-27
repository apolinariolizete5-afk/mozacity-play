import { createServerFn } from "@tanstack/react-start";

/** A chave pública VAPID é segura para o navegador; lida no servidor para não depender de VITE_*. */
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env["VAPID_PUBLIC_KEY"] ?? null };
});
