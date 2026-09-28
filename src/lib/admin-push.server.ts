import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSaleNotification } from "./sale-notification";

export async function getRandomSaleNotificationExample(
  supabaseAdmin: SupabaseClient<any>,
  preferred?: { modelName: string; amount: number },
) {
  const { data, error } = await supabaseAdmin
    .from("plan_models")
    .select("models!inner(name,is_active),plans!inner(price,is_active,plan_offers(price,is_active))")
    .eq("models.is_active", true)
    .eq("plans.is_active", true);
  if (error) throw error;
  const candidates = (data ?? []).flatMap((row: any) => {
    const model = Array.isArray(row.models) ? row.models[0] : row.models;
    const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
    if (!model?.name || !plan?.is_active) return [];
    const prices = [Number(plan.price), ...(plan.plan_offers ?? []).filter((offer: any) => offer.is_active).map((offer: any) => Number(offer.price))]
      .filter((price) => Number.isFinite(price) && price > 0);
    return prices.map((amount) => ({ modelName: String(model.name), amount }));
  });
  if (!candidates.length) throw new Error("Não foi possível encontrar uma modelo com plano ativo para o teste.");
  const selected = candidates.find((candidate) =>
    preferred && candidate.modelName === preferred.modelName && Math.round(candidate.amount * 100) === Math.round(preferred.amount * 100),
  ) ?? candidates[Math.floor(Math.random() * candidates.length)];
  return { ...selected, ...buildSaleNotification(selected.modelName, selected.amount) };
}

export async function sendPushToAdminSubscription(
  supabaseAdmin: SupabaseClient<any>,
  subscription: { id: string; endpoint: string; p256dh: string; auth_key: string },
  payload: Record<string, unknown>,
) {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) throw new Error("Configuração VAPID ausente.");
  const webpush = await import("web-push");
  webpush.default.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@privadinhos.online",
    publicKey,
    privateKey,
  );
  try {
    await webpush.default.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
      JSON.stringify(payload),
      { TTL: 300, urgency: "high" },
    );
  } catch (error: any) {
    const statusCode = Number(error?.statusCode ?? 0);
    if (statusCode === 404 || statusCode === 410) {
      await supabaseAdmin.from("admin_push_subscriptions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
    }
    throw new Error(`Falha ao enviar Web Push${statusCode ? ` (${statusCode})` : ""}.`);
  }
}

export async function notifyAdminsAboutApprovedSale(
  supabaseAdmin: SupabaseClient<any>,
  orderId: string,
) {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    console.warn("[Admin Push] Configuração VAPID ausente; notificação de venda ignorada.", { orderId });
    return;
  }

  const [{ data: order }, { data: items }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin.from("orders").select("total_amount, payment_status").eq("id", orderId).maybeSingle(),
    supabaseAdmin.from("order_items").select("models(name)").eq("order_id", orderId),
    supabaseAdmin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("is_active", true),
  ]);
  if (!order || order.payment_status !== "paid" || !subscriptions?.length) return;

  const modelNames = Array.from(
    new Set(
      (items ?? []).flatMap((item: any) => {
        const model = Array.isArray(item.models) ? item.models[0] : item.models;
        return model?.name ? [String(model.name)] : [];
      }),
    ),
  );
  const modelLabel = modelNames.length ? modelNames.join(", ") : "Modelo não identificada";
  const content = buildSaleNotification(modelLabel, Number(order.total_amount ?? 0));
  const payload = JSON.stringify({
    ...content,
    tag: `approved-sale-${orderId}`,
    orderId,
    url: "/admin",
  });

  const webpush = await import("web-push");
  webpush.default.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@privadinhos.online",
    publicKey,
    privateKey,
  );

  await Promise.allSettled(
    subscriptions.map(async (subscription: any) => {
      const { error: claimError } = await supabaseAdmin.from("admin_push_deliveries").insert({
        subscription_id: subscription.id,
        order_id: orderId,
        delivery_status: "pending",
      });
      if (claimError?.code === "23505") {
        const { data: delivery } = await supabaseAdmin
          .from("admin_push_deliveries")
          .select("delivery_status")
          .eq("subscription_id", subscription.id)
          .eq("order_id", orderId)
          .maybeSingle();
        if (delivery?.delivery_status !== "failed") return;
        const { error: retryError } = await supabaseAdmin
          .from("admin_push_deliveries")
          .update({ delivery_status: "pending", error_message: null })
          .eq("subscription_id", subscription.id)
          .eq("order_id", orderId);
        if (retryError) throw retryError;
      }
      if (claimError && claimError.code !== "23505") throw claimError;

      try {
        await webpush.default.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          },
          payload,
          { TTL: 300, urgency: "high" },
        );
        await supabaseAdmin
          .from("admin_push_deliveries")
          .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
          .eq("subscription_id", subscription.id)
          .eq("order_id", orderId);
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0);
        await supabaseAdmin
          .from("admin_push_deliveries")
          .update({
            delivery_status: "failed",
            error_message: `Push falhou${statusCode ? ` (${statusCode})` : ""}`,
          })
          .eq("subscription_id", subscription.id)
          .eq("order_id", orderId);
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin
            .from("admin_push_subscriptions")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", subscription.id);
        }
      }
    }),
  );
}
