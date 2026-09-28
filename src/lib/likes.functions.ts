import { createServerFn } from "@tanstack/react-start";
import {
  createPasswordCustomer,
  customerIdsForPhone,
  findCustomerByPhone,
} from "./customer-identity.server";
import { normalizeBrazilPhone } from "./phone";
import { validateFourDigitPassword, verifyPassword } from "./customer-password.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function resolveSession(token: string | null | undefined): Promise<{
  customerId: string;
} | null> {
  if (!token) return null;
  const db = await admin();
  const { data } = await db
    .from("customer_sessions")
    .select("customer_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return { customerId: data.customer_id as string };
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createManualCustomerAccount = createServerFn({ method: "POST" })
  .inputValidator(
    (raw: {
      name?: unknown;
      phone?: unknown;
      password?: unknown;
      passwordConfirmation?: unknown;
    }) => {
      const name = String(raw?.name ?? "")
        .trim()
        .replace(/\s+/g, " ");
      const phone = normalizeBrazilPhone(String(raw?.phone ?? ""));
      const password = String(raw?.password ?? "");
      const passwordConfirmation = String(raw?.passwordConfirmation ?? "");
      if (name.length < 2 || name.length > 100) throw new Error("Informe seu nome completo.");
      if (!phone) throw new Error("Informe um telefone válido com DDD.");
      validateFourDigitPassword(password);
      if (password !== passwordConfirmation) throw new Error("As senhas não são iguais.");
      return { name, phone, password };
    },
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const phoneHash = await sha256Hex(data.phone);
    const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db
      .from("phone_access_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone_hash", phoneHash)
      .eq("success", false)
      .gte("attempted_at", windowStart);
    if ((count ?? 0) >= 6)
      throw new Error("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.");

    if (await findCustomerByPhone(db, data.phone)) {
      await db.from("phone_access_attempts").insert({ phone_hash: phoneHash, success: false });
      throw new Error("Este telefone já possui cadastro. Use a opção Entrar.");
    }

    const customer = await createPasswordCustomer(db, data);
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error: sessionError } = await db.from("customer_sessions").insert({
      customer_id: customer.id,
      token,
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60_000).toISOString(),
    });
    if (sessionError) {
      await db.from("customers").delete().eq("id", customer.id);
      throw new Error("Não foi possível concluir a criação da conta. Tente novamente.");
    }
    await db.from("phone_access_attempts").insert({ phone_hash: phoneHash, success: true });
    return { token, customerId: customer.id, name: customer.name };
  });

export const startPhoneSession = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; password?: string; name?: string; email?: string }) => {
    const phone = normalizeBrazilPhone(String(data?.phone ?? ""));
    if (!phone) throw new Error("Informe um telefone válido com DDD.");
    return {
      phone,
      password: String(data?.password ?? ""),
      name: String(data?.name ?? "").trim(),
      email: String(data?.email ?? "")
        .trim()
        .toLowerCase(),
    };
  })
  .handler(async ({ data }) => {
    const db = await admin();
    const phoneHash = await sha256Hex(data.phone);

    // Rate limit without ever persisting the raw telephone in the attempts table.
    const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db
      .from("phone_access_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone_hash", phoneHash)
      .eq("success", false)
      .gte("attempted_at", windowStart);
    if ((count ?? 0) >= 6) {
      throw new Error("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.");
    }

    let customer;
    try {
      customer = await findCustomerByPhone(db, data.phone);
      if (!customer) {
        throw new Error("Não encontramos nenhuma compra vinculada a este telefone.");
      }
      if (!customer.is_active) {
        throw new Error("Este cadastro está inativo. Entre em contato com o suporte.");
      }

      const { data: credentials } = await db
        .from("customers")
        .select("password_hash,password_salt")
        .eq("id", customer.id)
        .maybeSingle();
      const isManualAccount = Boolean(credentials?.password_hash && credentials.password_salt);
      if (isManualAccount) {
        if (!data.password) throw new Error("Informe a senha desta conta.");
        if (!/^\d{4}$/.test(data.password)) throw new Error("Informe sua senha de 4 números.");
        if (
          !(await verifyPassword(
            data.password,
            credentials.password_hash,
            credentials.password_salt,
          ))
        )
          throw new Error("Senha incorreta.");
      } else {
        throw new Error(
          "Esta conta ainda não possui senha. Conclua o primeiro acesso após a compra ou recupere pelo suporte.",
        );
      }
    } catch (error) {
      await db.from("phone_access_attempts").insert({ phone_hash: phoneHash, success: false });
      throw error;
    }

    if (data.name && (!customer.name || customer.name === "Cliente")) {
      const { data: updated } = await db
        .from("customers")
        .update({ name: data.name })
        .eq("id", customer.id)
        .select("id,name,cpf,email,phone,normalized_phone,is_active")
        .maybeSingle();
      if (updated) customer = updated as typeof customer;
    }

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error: insErr } = await db.from("customer_sessions").insert({
      customer_id: customer.id,
      token,
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60_000).toISOString(),
    });
    if (insErr) throw new Error("Não foi possível iniciar a sessão");
    await db.from("phone_access_attempts").insert({ phone_hash: phoneHash, success: true });

    return { token, customerId: customer.id as string, name: customer.name as string };
  });

export const toggleMediaLike = createServerFn({ method: "POST" })
  .inputValidator((data: { mediaId: string; token: string }) => {
    if (!data?.mediaId || typeof data.mediaId !== "string") throw new Error("mediaId obrigatório");
    if (!data?.token || typeof data.token !== "string") throw new Error("Sessão obrigatória");
    return { mediaId: data.mediaId, token: data.token };
  })
  .handler(async ({ data }) => {
    const session = await resolveSession(data.token);
    if (!session)
      throw new Error("Sessão inválida ou expirada. Acesse novamente com seu telefone.");
    const db = await admin();

    const { data: existing } = await db
      .from("media_likes")
      .select("id")
      .eq("media_id", data.mediaId)
      .eq("customer_id", session.customerId)
      .maybeSingle();

    if (existing) {
      const { error } = await db.from("media_likes").delete().eq("id", existing.id);
      if (error) throw new Error("Falha ao remover curtida");
      return { liked: false };
    }
    const { error } = await db.from("media_likes").insert({
      media_id: data.mediaId,
      customer_id: session.customerId,
    });
    if (error) throw new Error("Falha ao registrar curtida");
    return { liked: true };
  });

export const listMyLikes = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; mediaIds: string[] }) => ({
    token: String(data?.token ?? ""),
    mediaIds: Array.isArray(data?.mediaIds) ? data.mediaIds.map(String) : [],
  }))
  .handler(async ({ data }) => {
    const session = await resolveSession(data.token);
    if (!session || data.mediaIds.length === 0) return { liked: [] as string[] };
    const db = await admin();
    const { data: rows } = await db
      .from("media_likes")
      .select("media_id")
      .eq("customer_id", session.customerId)
      .in("media_id", data.mediaIds);
    return { liked: (rows ?? []).map((r) => r.media_id as string) };
  });
