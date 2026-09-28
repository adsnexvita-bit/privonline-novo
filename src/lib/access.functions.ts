import { createServerFn } from "@tanstack/react-start";
import { createR2ReadUrl, isR2Reference } from "@/lib/r2.server";
import { customerIdsForPhone } from "./customer-identity.server";
import { maskBrazilPhone } from "./phone";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function resolveSession(token: string | null | undefined): Promise<{
  customerId: string;
  customerIds: string[];
  name: string;
  maskedPhone: string;
  email: string | null;
  phone: string | null;
} | null> {
  if (!token) return null;
  const db = await admin();
  const { data } = await db
    .from("customer_sessions")
    .select("customer_id, expires_at, customers ( name, email, phone, is_active )")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  const customer = (
    data as unknown as {
      customers: {
        name: string;
        email: string | null;
        phone: string | null;
        is_active: boolean;
      } | null;
    }
  ).customers;
  if (!customer || !customer.is_active) return null;
  const customerIds = await customerIdsForPhone(db, customer.phone, data.customer_id as string);
  return {
    customerId: data.customer_id as string,
    customerIds,
    name: customer.name,
    maskedPhone: maskBrazilPhone(customer.phone ?? ""),
    email: customer.email,
    phone: customer.phone,
  };
}

type AccessWithOrder = {
  order_id?: string | null;
  orders?: { payment_status?: string | null } | Array<{ payment_status?: string | null }> | null;
};

export function hasPaidOrManualAccess(access: AccessWithOrder): boolean {
  // Acessos criados manualmente pelo painel não possuem pedido. Para os demais,
  // mantemos a exigência de que o pedido esteja efetivamente pago.
  if (!access.order_id) return true;
  const order = Array.isArray(access.orders) ? access.orders[0] : access.orders;
  return order?.payment_status === "paid";
}

async function recoverOneRecentPendingOrder(
  db: Awaited<ReturnType<typeof admin>>,
  session: Awaited<ReturnType<typeof resolveSession>>,
) {
  if (!session) return;
  const selectors = session.customerIds.map((id) => `customer_id.eq.${id}`);
  const normalizedPhone = session.phone?.replace(/\D/g, "") ?? "";
  if (normalizedPhone) selectors.push(`normalized_phone.eq.${normalizedPhone}`);
  if (selectors.length === 0) return;
  const staleBefore = new Date(Date.now() - 15_000).toISOString();
  const { data: order, error } = await db
    .from("orders")
    .select("id,transaction_identifier")
    .eq("payment_provider", "syncpay")
    .eq("payment_status", "pending")
    .not("transaction_identifier", "is", null)
    .gte("created_at", new Date(Date.now() - 48 * 3_600_000).toISOString())
    .or(selectors.join(","))
    .or(`payment_last_checked_at.is.null,payment_last_checked_at.lt.${staleBefore}`)
    .order("payment_last_checked_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !order?.transaction_identifier) return;
  try {
    const { processPaymentConfirmation } = await import("./payment-processing.server");
    await processPaymentConfirmation(db, {
      provider: "syncpay",
      transactionId: String(order.transaction_identifier),
      confirmationSource: "api_reconciliation",
    });
  } catch (reason) {
    console.warn("payment:access_recovery_failed", {
      orderId: order.id,
      message: reason instanceof Error ? reason.message : String(reason),
    });
  }
}

export const getMySession = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }) => {
    const s = await resolveSession(data.token);
    if (!s) return null;
    return { name: s.name, maskedPhone: s.maskedPhone };
  });

export const hasPurchasedAccess = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }) => {
    const s = await resolveSession(data.token);
    if (!s) return false;
    const db = await admin();
    await recoverOneRecentPendingOrder(db, s);
    const { data: rows, error } = await db
      .from("customer_access")
      .select("expires_at, order_id, orders:order_id ( payment_status )")
      .in("customer_id", s.customerIds)
      .eq("access_status", "active")
      .limit(20);
    if (error) return false;
    return (rows ?? []).some(
      (row) =>
        hasPaidOrManualAccess(row as AccessWithOrder) &&
        (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()),
    );
  });

export function hasLinkedCustomerOrder(
  rows: Array<{ id: string }> | null | undefined,
  hasQueryError = false,
): boolean {
  // Em caso de falha, escondemos o suporte preventivamente para não exibi-lo
  // a um comprador enquanto o estado real da conta é desconhecido.
  return hasQueryError || Boolean(rows?.length);
}

export const hasAnyCustomerOrder = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }) => {
    const session = await resolveSession(data.token);
    if (!session) return false;
    const db = await admin();
    const { data: orders, error } = await db
      .from("orders")
      .select("id")
      .in("customer_id", session.customerIds)
      .limit(1);
    return hasLinkedCustomerOrder(orders, Boolean(error));
  });

export const getCheckoutIdentity = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }) => {
    const s = await resolveSession(data.token);
    if (!s) return null;
    return {
      customerId: s.customerId,
      name: s.name,
      email: s.email ?? "",
      phone: s.phone ?? "",
      anonymous: s.name === "Cliente anônimo",
    };
  });

export const endPhoneSession = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }) => {
    if (!data.token) return { ok: true };
    const db = await admin();
    await db.from("customer_sessions").delete().eq("token", data.token);
    return { ok: true };
  });

// Compatibilidade temporária com imports antigos durante a migração.
export const endCpfSession = endPhoneSession;

export type MyAccessItem = {
  accessId: string;
  grantedAt: string;
  model: {
    id: string;
    slug: string;
    name: string;
    username: string;
    cover_image_path: string | null;
    profile_image_path: string | null;
    photo_count: number;
    video_count: number;
  };
};

export const listMyAccesses = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<MyAccessItem[]> => {
    const s = await resolveSession(data.token);
    if (!s) throw new Error("Sessão inválida ou expirada.");
    const db = await admin();
    await recoverOneRecentPendingOrder(db, s);
    const { data: rows, error } = await db
      .from("customer_access")
      .select(
        "id, granted_at, expires_at, order_id, models:model_id ( id, slug, name, username, cover_image_path, profile_image_path, photo_count, video_count ), orders:order_id ( payment_status )",
      )
      .in("customer_id", s.customerIds)
      .eq("access_status", "active")
      .order("granted_at", { ascending: false });
    if (error) throw new Error("Falha ao carregar suas galerias");
    return (rows ?? [])
      .filter(
        (r) =>
          r.models &&
          hasPaidOrManualAccess(r as AccessWithOrder) &&
          (!(r as { expires_at?: string | null }).expires_at ||
            new Date((r as { expires_at: string }).expires_at).getTime() > Date.now()),
      )
      .map((r) => ({
        accessId: r.id as string,
        grantedAt: r.granted_at as string,
        model: r.models as MyAccessItem["model"],
      }));
  });

export type PrivateMediaItem = {
  id: string;
  media_type: "image" | "video";
  title: string | null;
  description: string | null;
  is_free_preview: boolean;
  display_order: number;
  like_count: number;
  comment_count: number;
  url: string;
};

export type PurchasedCommunity = {
  telegramUrl: string;
  title: string;
  description: string;
  buttonText: string;
};

const SIGNED_TTL_SECONDS = 60 * 15; // 15 minutes

function resolveBucketAndKey(path: string): { bucket: string; key: string } | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return null;
  }
  const [bucket, ...rest] = path.split("/");
  if (!bucket || rest.length === 0) return null;
  return { bucket, key: rest.join("/") };
}

export const listMyModelMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; modelSlug: string }) => ({
    token: String(data?.token ?? ""),
    modelSlug: String(data?.modelSlug ?? ""),
  }))
  .handler(
    async ({
      data,
    }): Promise<{
      model: MyAccessItem["model"];
      grantedAt: string;
      maskedPhone: string;
      media: PrivateMediaItem[];
      community: PurchasedCommunity | null;
      profileAudio: { title: string; url: string } | null;
    }> => {
      const s = await resolveSession(data.token);
      if (!s) throw new Error("Sessão inválida ou expirada.");
      const db = await admin();

      const { data: model, error: mErr } = await db
        .from("models")
        .select(
          "id, slug, name, username, cover_image_path, profile_image_path, photo_count, video_count, is_active, community_enabled, community_telegram_url, community_title, community_description, community_button_text, paid_audio_enabled, paid_audio_title, paid_audio_path",
        )
        .eq("slug", data.modelSlug)
        .maybeSingle();
      if (mErr || !model || !(model as { is_active: boolean }).is_active) {
        throw new Error("Criador não encontrado");
      }

      // Backend authorization: verify active access
      const { data: accesses } = await db
        .from("customer_access")
        .select("id, granted_at, expires_at, order_id, orders:order_id ( payment_status )")
        .in("customer_id", s.customerIds)
        .eq("model_id", (model as { id: string }).id)
        .eq("access_status", "active")
        .order("granted_at", { ascending: false });
      const access = (accesses ?? []).find(
        (item) =>
          hasPaidOrManualAccess(item as AccessWithOrder) &&
          (!item.expires_at || new Date(item.expires_at as string).getTime() > Date.now()),
      );
      if (
        !access ||
        !hasPaidOrManualAccess(access as AccessWithOrder) ||
        (access.expires_at && new Date(access.expires_at as string).getTime() <= Date.now())
      ) {
        throw new Error("Você ainda não possui acesso a esta galeria.");
      }

      const { data: mediaRows, error: medErr } = await db
        .from("model_media")
        .select(
          "id, media_type, file_path, preview_path, title, description, is_free_preview, display_order, like_count, comment_count",
        )
        .eq("model_id", (model as { id: string }).id)
        .order("display_order", { ascending: true });
      if (medErr) throw new Error("Falha ao carregar mídias");

      const rows = mediaRows ?? [];
      const signedUrls = new Map<string, string>();
      const r2Paths: string[] = [];
      const byBucket = new Map<string, string[]>();

      for (const row of rows) {
        const path = row.file_path as string;
        if (isR2Reference(path)) {
          r2Paths.push(path);
          continue;
        }
        const parsed = resolveBucketAndKey(path);
        if (!parsed) continue;
        const keys = byBucket.get(parsed.bucket) ?? [];
        keys.push(parsed.key);
        byBucket.set(parsed.bucket, keys);
      }

      await Promise.all(
        [...byBucket.entries()].map(async ([bucket, keys]) => {
          const { data: signed } = await db.storage
            .from(bucket)
            .createSignedUrls(keys, SIGNED_TTL_SECONDS);
          for (const item of signed ?? []) {
            if (item.signedUrl) signedUrls.set(`${bucket}/${item.path}`, item.signedUrl);
          }
        }),
      );
      await Promise.all(
        r2Paths.map(async (path) => {
          const url = await createR2ReadUrl(path, SIGNED_TTL_SECONDS);
          if (url) signedUrls.set(path, url);
        }),
      );

      const media: PrivateMediaItem[] = rows.flatMap((row) => {
        const path = row.file_path as string;
        const parsed = resolveBucketAndKey(path);
        const url = isR2Reference(path)
          ? signedUrls.get(path)
          : parsed
            ? signedUrls.get(`${parsed.bucket}/${parsed.key}`)
            : path;
        if (!url) return [];
        return [
          {
            id: row.id as string,
            media_type: row.media_type as "image" | "video",
            title: row.title as string | null,
            description: row.description as string | null,
            is_free_preview: row.is_free_preview as boolean,
            display_order: row.display_order as number,
            like_count: row.like_count as number,
            comment_count: row.comment_count as number,
            url,
          },
        ];
      });

      const {
        id,
        slug,
        name,
        username,
        cover_image_path,
        profile_image_path,
        photo_count,
        video_count,
      } = model as MyAccessItem["model"];
      const communityModel = model as {
        community_telegram_url?: string | null;
        community_enabled?: boolean;
        community_title?: string | null;
        community_description?: string | null;
        community_button_text?: string | null;
      };
      const communityUrl =
        communityModel.community_enabled && communityModel.community_telegram_url?.trim()
          ? communityModel.community_telegram_url
          : null;
      const audioModel = model as {
        paid_audio_enabled?: boolean;
        paid_audio_title?: string | null;
        paid_audio_path?: string | null;
      };
      const paidAudioUrl =
        audioModel.paid_audio_enabled && audioModel.paid_audio_path
          ? await createR2ReadUrl(audioModel.paid_audio_path, SIGNED_TTL_SECONDS)
          : null;
      return {
        model: {
          id,
          slug,
          name,
          username,
          cover_image_path,
          profile_image_path,
          photo_count,
          video_count,
        },
        grantedAt: (access as { granted_at: string }).granted_at,
        maskedPhone: s.maskedPhone,
        media,
        profileAudio:
          paidAudioUrl && audioModel.paid_audio_title?.trim()
            ? { title: audioModel.paid_audio_title.trim(), url: paidAudioUrl }
            : null,
        community: communityUrl
          ? {
              telegramUrl: communityUrl,
              title: communityModel.community_title?.trim() || "Comunidade exclusiva",
              description:
                communityModel.community_description?.trim() ||
                "Seu acesso foi liberado. Entre agora na comunidade premium no Telegram.",
              buttonText:
                communityModel.community_button_text?.trim() || "Acessar comunidade no Telegram",
            }
          : null,
      };
    },
  );
