import { createServerFn } from "@tanstack/react-start";
import { createR2ReadUrl } from "./r2.server";
import { hasPaidOrManualAccess, resolveSession } from "./access.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _auth_user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores.");
}

async function authorized(token: string, creatorId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const session = await resolveSession(token);
  if (!session) throw new Error("Sessão inválida ou expirada.");
  const { data: accesses } = await db
    .from("customer_access")
    .select("expires_at,order_id,orders:order_id(payment_status)")
    .in("customer_id", session.customerIds)
    .eq("model_id", creatorId)
    .eq("access_status", "active");
  const allowed = (accesses ?? []).some(
    (access: any) =>
      hasPaidOrManualAccess(access) &&
      (!access.expires_at || new Date(access.expires_at).getTime() > Date.now()),
  );
  if (!allowed) throw new Error("Você não possui acesso pago a esta criadora.");
  return { db: db as any, session };
}

export const listCreatorPosts = createServerFn({ method: "POST" })
  .inputValidator((raw: any) => ({
    token: String(raw?.token ?? ""),
    creatorId: String(raw?.creatorId ?? ""),
  }))
  .handler(async ({ data }) => {
    const { db, session } = await authorized(data.token, data.creatorId);
    const { data: rows, error } = await db
      .from("creator_posts")
      .select("*")
      .eq("creator_id", data.creatorId)
      .eq("is_active", true)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os posts.");
    const postIds = (rows ?? []).map((post: any) => post.id);
    const { data: reactions } = postIds.length
      ? await db
          .from("creator_post_reactions")
          .select("post_id,reaction")
          .eq("customer_id", session.customerId)
          .in("post_id", postIds)
      : { data: [] };
    const selectedByPost = new Map<string, string[]>();
    for (const row of reactions ?? []) {
      selectedByPost.set(row.post_id, [...(selectedByPost.get(row.post_id) ?? []), row.reaction]);
    }
    return Promise.all(
      (rows ?? []).map(async (post: any) => {
        const { data: mediaRows } = await db
          .from("creator_post_media")
          .select("media_key,media_type,display_order")
          .eq("post_id", post.id)
          .order("display_order");
        const source = mediaRows?.length
          ? mediaRows
          : [{ media_key: post.media_key, media_type: post.media_type, display_order: 0 }];
        const media = await Promise.all(
          source.map(async (item: any) => ({
            ...item,
            media_url: await createR2ReadUrl(item.media_key),
          })),
        );
        return {
          ...post,
          media_url: media[0]?.media_url ?? (await createR2ReadUrl(post.media_key)),
          media,
          audio_url: post.audio_key ? await createR2ReadUrl(post.audio_key) : null,
          user_reactions: selectedByPost.get(post.id) ?? [],
        };
      }),
    );
  });

const creatorReactionColumns = {
  like: "likes_count",
  fire: "fire_count",
  heart_eyes: "heart_eyes_count",
  laugh: "laugh_count",
  clap: "clap_count",
} as const;

export const reactToCreatorPost = createServerFn({ method: "POST" })
  .inputValidator((raw: any) => ({
    token: String(raw?.token ?? ""),
    creatorId: String(raw?.creatorId ?? ""),
    postId: String(raw?.postId ?? ""),
    reaction: String(raw?.reaction ?? "") as keyof typeof creatorReactionColumns,
  }))
  .handler(async ({ data }) => {
    if (!(data.reaction in creatorReactionColumns)) throw new Error("Reação inválida.");
    const { db, session } = await authorized(data.token, data.creatorId);
    const { data: post } = await db
      .from("creator_posts")
      .select("id")
      .eq("id", data.postId)
      .eq("creator_id", data.creatorId)
      .eq("is_active", true)
      .maybeSingle();
    if (!post) throw new Error("Post indisponível.");
    const { data: result, error } = await db.rpc("add_creator_post_reaction", {
      _post_id: data.postId,
      _customer_id: session.customerId,
      _reaction: data.reaction,
    });
    if (error) throw new Error("Não foi possível registrar sua reação.");
    return result;
  });

export const createCreatorGift = createServerFn({ method: "POST" })
  .inputValidator((raw: any) => ({
    token: String(raw?.token ?? ""),
    creatorId: String(raw?.creatorId ?? ""),
    postId: String(raw?.postId ?? "") || null,
    amount: Number(raw?.amount),
    message: String(raw?.message ?? "")
      .trim()
      .slice(0, 500),
  }))
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.amount) || data.amount < 1 || data.amount > 450)
      throw new Error("Informe um valor entre R$ 1,00 e R$ 450,00.");
    const { db, session } = await authorized(data.token, data.creatorId);
    const { data: customer } = await db
      .from("customers")
      .select("name,phone,cpf,email")
      .eq("id", session.customerId)
      .single();
    if (data.postId) {
      const { data: post } = await db
        .from("creator_posts")
        .select("id")
        .eq("id", data.postId)
        .eq("creator_id", data.creatorId)
        .eq("is_active", true)
        .maybeSingle();
      if (!post) throw new Error("Post indisponível.");
    }
    const { data: gift, error } = await db
      .from("creator_gifts")
      .insert({
        creator_id: data.creatorId,
        post_id: data.postId,
        customer_id: session.customerId,
        buyer_phone: customer.phone ?? "",
        amount: Number(data.amount.toFixed(2)),
        message: data.message || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível iniciar o presente.");
    const { createPixCharge } = await import("./payment-provider.server");
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    const charge = await createPixCharge("syncpay", {
      orderId: `gift:${gift.id}`,
      amount: data.amount,
      webhookOrigin: getRequestUrl().origin,
      client: {
        cpf: customer.cpf || "52998224725",
        name: customer.name,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
      },
    });
    await db
      .from("creator_gifts")
      .update({ transaction_identifier: charge.identifier })
      .eq("id", gift.id);
    return { giftId: gift.id, pixCode: charge.pixCode, amount: data.amount };
  });

export const checkCreatorGift = createServerFn({ method: "POST" })
  .inputValidator((raw: any) => ({
    token: String(raw?.token ?? ""),
    giftId: String(raw?.giftId ?? ""),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const session = await resolveSession(data.token);
    if (!session) throw new Error("Sessão inválida.");
    const { data: gift } = await (db as any)
      .from("creator_gifts")
      .select("*")
      .eq("id", data.giftId)
      .eq("customer_id", session.customerId)
      .single();
    if (gift.status === "paid") return { status: "paid" as const };
    const { verifyPixCharge } = await import("./payment-provider.server");
    const verified = await verifyPixCharge(
      "syncpay",
      gift.transaction_identifier,
      Number(gift.amount),
    );
    if (verified.status === "paid")
      await (db as any)
        .from("creator_gifts")
        .update({ status: "paid", paid_at: verified.transactionDate ?? new Date().toISOString() })
        .eq("id", gift.id)
        .eq("status", "pending");
    return { status: verified.status };
  });

export const getCreatorPostsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: any) => ({ creatorId: String(r?.creatorId ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: posts, error } = await (db as any)
      .from("creator_posts")
      .select("*")
      .eq("creator_id", data.creatorId)
      .order("published_at", { ascending: false });
    if (error) throw error;
    const resolved = await Promise.all(
      (posts ?? []).map(async (p: any) => {
        const { data: rows } = await (db as any)
          .from("creator_post_media")
          .select("*")
          .eq("post_id", p.id)
          .order("display_order");
        const source = rows?.length
          ? rows
          : [{ media_key: p.media_key, media_type: p.media_type, display_order: 0 }];
        const media = await Promise.all(
          source.map(async (m: any) => ({ ...m, media_url: await createR2ReadUrl(m.media_key) })),
        );
        return {
          ...p,
          media,
          media_url: media[0]?.media_url,
          audio_url: p.audio_key ? await createR2ReadUrl(p.audio_key) : null,
        };
      }),
    );
    const { data: gifts } = await (db as any)
      .from("creator_gifts")
      .select("*,customers(name,phone),creator_posts(caption)")
      .eq("creator_id", data.creatorId)
      .order("created_at", { ascending: false });
    return { posts: resolved, gifts: gifts ?? [] };
  });

export const saveCreatorPostAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: any) => ({
    id: String(r?.id ?? "") || null,
    creatorId: String(r?.creatorId ?? ""),
    caption: String(r?.caption ?? "").slice(0, 5000),
    mediaItems: Array.isArray(r?.mediaItems)
      ? r.mediaItems.slice(0, 10).map((m: any) => ({
          mediaKey: String(m?.mediaKey ?? ""),
          mediaType: m?.mediaType === "video" ? "video" : "image",
        }))
      : [],
    audioKey: String(r?.audioKey ?? "") || null,
    audioTitle:
      String(r?.audioTitle ?? "")
        .trim()
        .slice(0, 80) || null,
    publishedAt: String(r?.publishedAt ?? ""),
    isActive: Boolean(r?.isActive),
    likes: Math.max(0, Number(r?.likes) || 0),
    fire: Math.max(0, Number(r?.fire) || 0),
    heartEyes: Math.max(0, Number(r?.heartEyes) || 0),
    laugh: Math.max(0, Number(r?.laugh) || 0),
    clap: Math.max(0, Number(r?.clap) || 0),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (
      !data.creatorId ||
      !data.mediaItems.length ||
      data.mediaItems.some((m: any) => !m.mediaKey.startsWith("r2://models/"))
    ) {
      throw new Error("Adicione ao menos uma mídia válida ao post.");
    }
    if (data.audioKey && !data.audioKey.startsWith("r2://models/")) {
      throw new Error("Áudio do post inválido.");
    }

    const publishedAt = new Date(data.publishedAt);
    if (Number.isNaN(publishedAt.getTime()))
      throw new Error("Informe uma data de publicação válida.");

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const first = data.mediaItems[0];
    const basePayload = {
      creator_id: data.creatorId,
      caption: data.caption,
      media_key: first.mediaKey,
      media_type: first.mediaType,
      published_at: publishedAt.toISOString(),
      is_active: data.isActive,
      likes_count: data.likes,
      fire_count: data.fire,
      heart_eyes_count: data.heartEyes,
      laugh_count: data.laugh,
      clap_count: data.clap,
      updated_at: new Date().toISOString(),
    };
    const fullPayload = { ...basePayload, audio_key: data.audioKey, audio_title: data.audioTitle };

    const persist = (payload: Record<string, unknown>) =>
      data.id
        ? (db as any)
            .from("creator_posts")
            .update(payload)
            .eq("id", data.id)
            .eq("creator_id", data.creatorId)
            .select("id")
            .single()
        : (db as any).from("creator_posts").insert(payload).select("id").single();

    let result = await persist(fullPayload);
    const missingAudioColumns =
      result.error &&
      (["42703", "PGRST204"].includes(String(result.error.code)) ||
        /audio_(key|title).*schema cache|column.*audio_/i.test(String(result.error.message)));
    if (missingAudioColumns) result = await persist(basePayload);
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Não foi possível salvar o post.");
    }

    const postId = result.data.id;
    const { error: deleteMediaError } = await (db as any)
      .from("creator_post_media")
      .delete()
      .eq("post_id", postId);
    const mediaTableMissing =
      deleteMediaError &&
      (["42P01", "PGRST205"].includes(String(deleteMediaError.code)) ||
        /creator_post_media.*schema cache|relation.*creator_post_media/i.test(
          String(deleteMediaError.message),
        ));

    if (!mediaTableMissing) {
      if (deleteMediaError) throw new Error(deleteMediaError.message);
      const { error: mediaError } = await (db as any).from("creator_post_media").insert(
        data.mediaItems.map((m: any, index: number) => ({
          post_id: postId,
          media_key: m.mediaKey,
          media_type: m.mediaType,
          display_order: index,
        })),
      );
      if (mediaError) throw new Error(mediaError.message);
    }

    return { ok: true, compatibilityMode: Boolean(missingAudioColumns || mediaTableMissing) };
  });

export const deleteCreatorPostAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: any) => ({ id: String(r?.id ?? ""), creatorId: String(r?.creatorId ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await (db as any)
      .from("creator_posts")
      .delete()
      .eq("id", data.id)
      .eq("creator_id", data.creatorId);
    if (error) throw error;
    return { ok: true };
  });

export async function processCreatorGiftPayment(giftId: string, transactionId: string | null) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: gift } = await (db as any)
    .from("creator_gifts")
    .select("id,amount,status,transaction_identifier")
    .eq("id", giftId)
    .maybeSingle();
  if (!gift) return { ok: false, status: "missing" };
  if (gift.status === "paid") return { ok: true, status: "paid" };
  if (!gift.transaction_identifier || transactionId !== gift.transaction_identifier)
    return { ok: false, status: "mismatch" };
  const { verifyPixCharge } = await import("./payment-provider.server");
  const verified = await verifyPixCharge(
    "syncpay",
    gift.transaction_identifier,
    Number(gift.amount),
  );
  await (db as any)
    .from("creator_gifts")
    .update({
      status: verified.status,
      paid_at:
        verified.status === "paid" ? (verified.transactionDate ?? new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gift.id)
    .neq("status", "paid");
  return { ok: true, status: verified.status };
}
