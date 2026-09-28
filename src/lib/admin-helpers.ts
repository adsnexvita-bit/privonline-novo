import { supabase } from "@/integrations/supabase/client";

const ADMIN_AUTH_TIMEOUT_MS = 12_000;

function withAdminAuthTimeout<T>(promise: PromiseLike<T>, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`Tempo esgotado ao ${step}. Verifique sua conexão e tente novamente.`));
    }, ADMIN_AUTH_TIMEOUT_MS);

    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Fetches the current auth user + verifies they have an active admin_users row. */
export async function fetchAdminIdentity(): Promise<{
  authUserId: string;
  email: string;
  adminId: string;
  name: string | null;
} | null> {
  // Reading the locally persisted session first avoids an unnecessary network
  // round-trip when the installed PWA is opened. Every remote step is bounded
  // so a suspended mobile browser can never leave the dashboard loading forever.
  const { data: sessionData, error: sessionError } = await withAdminAuthTimeout(
    supabase.auth.getSession(),
    "recuperar sua sessão",
  );
  if (sessionError) throw sessionError;

  const sessionUser = sessionData.session?.user;
  if (!sessionUser) return null;

  const { data: userData, error: userError } = await withAdminAuthTimeout(
    supabase.auth.getUser(),
    "validar sua sessão",
  );
  if (userError) throw userError;
  const user = userData.user;
  if (!user) return null;
  const { data: adminRow, error: adminError } = await withAdminAuthTimeout(
    supabase
      .from("admin_users")
      .select("id, name, email, is_active")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    "validar o acesso ao painel",
  );
  if (adminError) throw adminError;
  if (!adminRow) return null;
  return {
    authUserId: user.id,
    email: user.email ?? adminRow.email,
    adminId: adminRow.id,
    name: adminRow.name,
  };
}

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: params.adminId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    details: (params.details ?? {}) as never,
  });
}

export function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}
