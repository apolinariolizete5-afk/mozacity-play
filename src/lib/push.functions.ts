import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export const getPushConfig = createServerFn({ method: "GET" })
  .handler(async () => ({
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
  }));

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ subscription: subscriptionSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const subscription = data.subscription;
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ endpoint: z.string().url().max(2048) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendPushToSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(500),
      url: z.string().trim().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      throw new Error("push_not_configured");
    }

    const { data: rows, error } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    const webpushModule = await import("web-push");
    const webpush = webpushModule.default ?? webpushModule;
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      url: data.url || "/notifications",
    });

    let sent = 0;
    for (const row of rows ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
        );
        sent += 1;
      } catch (error: any) {
        const status = Number(error?.statusCode);
        if (status === 404 || status === 410) {
          await context.supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", row.endpoint)
            .eq("user_id", context.userId);
        }
      }
    }

    return { sent };
  });
