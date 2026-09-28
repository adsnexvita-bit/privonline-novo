import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _auth_user_id: userId });
  if (error || !data) throw new Error("Acesso restrito a administradores.");
}

export const getAdminPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
    const db = await adminClient();
    const { getRandomSaleNotificationExample } = await import("./admin-push.server");
    const preview = await getRandomSaleNotificationExample(db).catch(() => null);
    return { available: Boolean(publicKey), publicKey, preview };
  });

export const saveAdminPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: PushSubscriptionInput) => {
    if (!raw?.endpoint?.startsWith("https://")) throw new Error("Assinatura push inválida.");
    if (!raw?.keys?.p256dh || !raw?.keys?.auth) throw new Error("Chaves push ausentes.");
    return raw;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("admin_push_subscriptions")
      .upsert(
        {
          auth_user_id: context.userId,
          endpoint: data.endpoint,
          p256dh: data.keys.p256dh,
          auth_key: data.keys.auth,
          user_agent: null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const disableAdminPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { endpoint: string }) => {
    if (!raw?.endpoint) throw new Error("Endpoint obrigatório.");
    return { endpoint: String(raw.endpoint) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("admin_push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("auth_user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw error;
    return { ok: true };
  });

async function adminClient() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin as any;
}

async function ownedSubscription(db: any, userId: string, endpoint: string) {
  const { data, error } = await db.from("admin_push_subscriptions")
    .select("id,endpoint,p256dh,auth_key,is_active")
    .eq("auth_user_id", userId).eq("endpoint", endpoint).maybeSingle();
  if (error || !data?.is_active) throw new Error("A assinatura deste dispositivo não está ativa.");
  return data;
}

export const sendAdminTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { endpoint: string; modelName: string; amount: number }) => ({
    endpoint: String(raw?.endpoint ?? ""),
    modelName: String(raw?.modelName ?? ""),
    amount: Number(raw?.amount),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const subscription = await ownedSubscription(db, context.userId, data.endpoint);
    const { getRandomSaleNotificationExample, sendPushToAdminSubscription } = await import("./admin-push.server");
    try {
      const content = await getRandomSaleNotificationExample(db, { modelName: data.modelName, amount: data.amount });
      await sendPushToAdminSubscription(db, subscription, {
        title: content.title,
        body: content.body,
        tag: `admin-push-test-${Date.now()}`,
        url: "/admin",
        type: "ADMIN_PUSH_TEST",
      });
    } catch (pushError) {
      console.error("[Admin Push Test] Falha no teste rápido.", { userId: context.userId, endpoint: data.endpoint, message: pushError instanceof Error ? pushError.message : String(pushError) });
      throw pushError;
    }
    return { ok: true };
  });

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const startAdminPushTestSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { endpoint: string; quantity: number; intervalSeconds: number }) => {
    const quantity = Math.floor(Number(raw?.quantity));
    const intervalSeconds = Math.floor(Number(raw?.intervalSeconds));
    if (quantity < 1 || quantity > 50) throw new Error("Use entre 1 e 50 notificações.");
    if (intervalSeconds < 5) throw new Error("O intervalo mínimo é de 5 segundos.");
    if ((quantity - 1) * intervalSeconds > 240) throw new Error("A sequência pode durar no máximo 4 minutos.");
    return { endpoint: String(raw?.endpoint ?? ""), quantity, intervalSeconds };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const subscription = await ownedSubscription(db, context.userId, data.endpoint);
    const { data: run, error } = await db.from("admin_push_test_runs").insert({
      auth_user_id: context.userId,
      subscription_id: subscription.id,
      quantity: data.quantity,
      interval_seconds: data.intervalSeconds,
      sent_count: 0,
      status: "running",
      next_send_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !run) throw new Error("Não foi possível iniciar o teste.");
    return { id: run.id };
  });

export const processAdminPushTestSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { id: string }) => ({ id: String(raw?.id ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { data: run } = await db.from("admin_push_test_runs")
      .select("id,subscription_id,quantity,interval_seconds,status,admin_push_subscriptions(id,endpoint,p256dh,auth_key,is_active)")
      .eq("id", data.id).eq("auth_user_id", context.userId).maybeSingle();
    if (!run || run.status !== "running") return { ok: false };
    const subscription = Array.isArray(run.admin_push_subscriptions) ? run.admin_push_subscriptions[0] : run.admin_push_subscriptions;
    if (!subscription?.is_active) throw new Error("A assinatura deste dispositivo não está ativa.");
    const { getRandomSaleNotificationExample, sendPushToAdminSubscription } = await import("./admin-push.server");
    for (let index = 0; index < run.quantity; index += 1) {
      if (index > 0) await wait(run.interval_seconds * 1000);
      const { data: state } = await db.from("admin_push_test_runs").select("status").eq("id", run.id).single();
      if (state?.status !== "running") break;
      try {
        const content = await getRandomSaleNotificationExample(db);
        await sendPushToAdminSubscription(db, subscription, {
          title: content.title,
          body: content.body,
          tag: `admin-push-sequence-${run.id}-${index + 1}`,
          url: "/admin",
          type: "ADMIN_PUSH_TEST",
        });
        await db.from("admin_push_test_runs").update({
          sent_count: index + 1,
          next_send_at: index + 1 < run.quantity ? new Date(Date.now() + run.interval_seconds * 1000).toISOString() : null,
          status: index + 1 === run.quantity ? "completed" : "running",
          completed_at: index + 1 === run.quantity ? new Date().toISOString() : null,
        }).eq("id", run.id);
      } catch (pushError) {
        console.error("[Admin Push Test] Falha na sequência.", { runId: run.id, message: pushError instanceof Error ? pushError.message : String(pushError) });
        await db.from("admin_push_test_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", run.id);
        break;
      }
    }
    return { ok: true };
  });

export const getAdminPushTestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { id: string }) => ({ id: String(raw?.id ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { data: run } = await db.from("admin_push_test_runs")
      .select("id,quantity,interval_seconds,sent_count,status,next_send_at")
      .eq("id", data.id).eq("auth_user_id", context.userId).maybeSingle();
    if (!run) throw new Error("Teste não encontrado.");
    return run;
  });

export const cancelAdminPushTestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { id: string }) => ({ id: String(raw?.id ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    await db.from("admin_push_test_runs").update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.id).eq("auth_user_id", context.userId).eq("status", "running");
    return { ok: true };
  });
