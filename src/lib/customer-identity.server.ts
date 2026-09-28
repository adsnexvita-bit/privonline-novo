import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidCpf } from "./cpf";
import { normalizeBrazilPhone } from "./phone";
import { createPasswordCredentials } from "./customer-password.server";

export type CustomerIdentity = {
  id: string;
  name: string;
  cpf: string;
  email: string | null;
  phone: string | null;
  normalized_phone?: string | null;
  is_active: boolean;
};

// Keep this compatible with the original customers table. Extra checkout data
// must never make the payment path depend on a migration that is not deployed.
const CUSTOMER_IDENTITY_SELECT = "id,name,cpf,email,phone,is_active";

async function createTechnicalCpf(db: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
    const digit = (value: string, factor: number) => {
      let sum = 0;
      for (const item of value) sum += Number(item) * factor--;
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    const first = digit(base, 10);
    const candidate = `${base}${first}${digit(`${base}${first}`, 11)}`;
    const { data } = await db.from("customers").select("id").eq("cpf", candidate).maybeSingle();
    if (!data && isValidCpf(candidate)) return candidate;
  }
  throw new Error("Não foi possível criar a identificação técnica.");
}

export function createTechnicalPayerCpf(): string {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
    const digit = (value: string, factor: number) => {
      let sum = 0;
      for (const item of value) sum += Number(item) * factor--;
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    const first = digit(base, 10);
    const candidate = `${base}${first}${digit(`${base}${first}`, 11)}`;
    if (isValidCpf(candidate)) return candidate;
  }
  throw new Error("Não foi possível preparar os dados técnicos do pagador.");
}

/**
 * Creates the technical customer record required by the checkout without
 * consulting the phone identity directory. Phone lookup belongs to the login
 * flow; a new checkout must always be able to proceed directly to PIX.
 */
export async function createCheckoutCustomer(
  db: SupabaseClient,
  input: { phone: string; name?: string; email?: string; messageOptIn?: boolean },
): Promise<CustomerIdentity> {
  const normalized = normalizeBrazilPhone(input.phone);
  if (!normalized) throw new Error("Telefone inválido.");

  // Checkout must never depend on the phone identity directory used by login.
  // This private lookup only reuses an existing technical customer, preventing
  // a repeated PIX attempt from failing on the phone uniqueness constraint.
  const findExistingCheckoutCustomer = async (): Promise<CustomerIdentity | null> => {
    const { data, error } = await db
      .from("customers")
      .select(CUSTOMER_IDENTITY_SELECT)
      .eq("phone", normalized)
      .limit(1);

    // Reusing a customer is only an optimisation. Never stop the PIX flow if
    // a non-essential lookup fails; the insert below remains the source of truth.
    if (error) return null;
    return (data as CustomerIdentity[] | null)?.[0] ?? null;
  };

  const existing = await findExistingCheckoutCustomer();
  if (existing) return existing;

  const cpf = await createTechnicalCpf(db);
  const { data, error } = await db
    .from("customers")
    .insert({
      cpf,
      name: input.name?.trim() || "Cliente",
      email: input.email?.trim().toLowerCase() || null,
      phone: normalized,
      is_active: true,
    })
    .select(CUSTOMER_IDENTITY_SELECT)
    .single();

  if (!error && data) return data as CustomerIdentity;

  // A second request can arrive at the same time for the same phone. In that
  // case the other request creates the shared technical customer first; reuse
  // it and continue generating the PIX instead of surfacing a checkout error.
  const concurrentCustomer = await findExistingCheckoutCustomer();
  if (concurrentCustomer) return concurrentCustomer;

  console.error("checkout:error", {
    stage: "customer_identity",
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
  throw new Error("Não foi possível preparar a compra.");
}

export async function customerIdsForPhone(
  db: SupabaseClient,
  phone: string | null | undefined,
  fallbackCustomerId?: string,
): Promise<string[]> {
  const normalized = normalizeBrazilPhone(phone ?? "");
  const ids = new Set<string>(fallbackCustomerId ? [fallbackCustomerId] : []);
  if (!normalized) return [...ids];
  const { data: linked } = await db
    .from("customer_phone_identities")
    .select("customer_id")
    .eq("normalized_phone", normalized)
    .maybeSingle();
  if (linked?.customer_id) ids.add(String(linked.customer_id));
  const { data: customers } = await db
    .from("customers")
    .select("id")
    .eq("normalized_phone", normalized);
  for (const customer of customers ?? []) ids.add(String(customer.id));
  return [...ids];
}

export async function findCustomerByPhone(
  db: SupabaseClient,
  phone: string,
): Promise<CustomerIdentity | null> {
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) throw new Error("Telefone inválido.");

  const { data: identity, error: identityError } = await db
    .from("customer_phone_identities")
    .select("customer_id")
    .eq("normalized_phone", normalized)
    .maybeSingle();
  if (identityError) throw new Error("Não foi possível consultar este telefone.");

  if (identity?.customer_id) {
    const { data, error } = await db
      .from("customers")
      .select("id,name,cpf,email,phone,normalized_phone,is_active")
      .eq("id", identity.customer_id)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar este telefone.");
    if (data) return data as CustomerIdentity;
  }

  const { data, error } = await db
    .from("customers")
    .select("id,name,cpf,email,phone,normalized_phone,is_active")
    .eq("normalized_phone", normalized)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar este telefone.");
  return (data as CustomerIdentity | null) ?? null;
}

export async function findOrCreateCustomerByPhone(
  db: SupabaseClient,
  input: { phone: string; name?: string; email?: string; messageOptIn?: boolean },
): Promise<CustomerIdentity> {
  const normalized = normalizeBrazilPhone(input.phone);
  if (!normalized) throw new Error("Telefone inválido.");

  let customer = await findCustomerByPhone(db, normalized);
  if (!customer) {
    const cpf = await createTechnicalCpf(db);
    const { data, error } = await db
      .from("customers")
      .insert({
        cpf,
        name: input.name?.trim() || "Cliente",
        email: input.email?.trim().toLowerCase() || null,
        phone: normalized,
        normalized_phone: normalized,
        message_opt_in: Boolean(input.messageOptIn),
        message_opt_in_updated_at: new Date().toISOString(),
        is_active: true,
      })
      .select("id,name,cpf,email,phone,normalized_phone,is_active")
      .single();
    if (error || !data) throw new Error("Não foi possível criar seu cadastro.");
    customer = data as CustomerIdentity;
  }
  if (!customer.is_active)
    throw new Error("Este cadastro está inativo. Entre em contato com o suporte.");

  const patch: Record<string, unknown> = {
    phone: normalized,
    normalized_phone: normalized,
  };
  if (input.name?.trim() && (!customer.name || customer.name === "Cliente"))
    patch.name = input.name.trim();
  if (input.email?.trim() && !customer.email) patch.email = input.email.trim().toLowerCase();
  if (typeof input.messageOptIn === "boolean") {
    patch.message_opt_in = input.messageOptIn;
    patch.message_opt_in_updated_at = new Date().toISOString();
  }
  await db.from("customers").update(patch).eq("id", customer.id);
  await db
    .from("customer_phone_identities")
    .upsert(
      { normalized_phone: normalized, customer_id: customer.id },
      { onConflict: "normalized_phone" },
    );
  return { ...customer, ...patch, phone: normalized } as CustomerIdentity;
}

/** Creates the same password-backed customer identity used by the public
 * account flow. Administrative callers can then grant access independently
 * from orders without introducing a second authentication model. */
export async function createPasswordCustomer(
  db: SupabaseClient,
  input: { phone: string; name: string; password: string; allowExisting?: boolean },
): Promise<CustomerIdentity> {
  const normalized = normalizeBrazilPhone(input.phone);
  if (!normalized) throw new Error("Informe um telefone válido com DDD.");
  const existing = await findCustomerByPhone(db, normalized);
  if (existing) {
    if (input.allowExisting) return existing;
    throw new Error("Este telefone já possui cadastro. Use a opção Entrar.");
  }

  const { passwordHash, passwordSalt } = await createPasswordCredentials(input.password);
  let customer: CustomerIdentity | null = null;
  for (let attempt = 0; attempt < 5 && !customer; attempt += 1) {
    const { data, error } = await db
      .from("customers")
      .insert({
        cpf: createTechnicalPayerCpf(),
        name: input.name,
        phone: normalized,
        normalized_phone: normalized,
        is_active: true,
        password_hash: passwordHash,
        password_salt: passwordSalt,
        password_created_at: new Date().toISOString(),
      })
      .select("id,name,cpf,email,phone,normalized_phone,is_active")
      .single();
    if (data) customer = data as CustomerIdentity;
    else if (error?.code !== "23505") throw new Error("Não foi possível criar a conta.");
  }
  if (!customer) {
    const concurrent = await findCustomerByPhone(db, normalized);
    if (concurrent && input.allowExisting) return concurrent;
    if (concurrent) throw new Error("Este telefone já possui cadastro. Use a opção Entrar.");
    throw new Error("Não foi possível criar a conta.");
  }

  const { error: identityError } = await db.from("customer_phone_identities").insert({
    normalized_phone: normalized,
    customer_id: customer.id,
  });
  if (identityError) {
    await db.from("customers").delete().eq("id", customer.id);
    const concurrent = await findCustomerByPhone(db, normalized);
    if (concurrent && input.allowExisting) return concurrent;
    if (concurrent) throw new Error("Este telefone já possui cadastro. Use a opção Entrar.");
    throw new Error("Não foi possível vincular o telefone à conta.");
  }
  return customer;
}
