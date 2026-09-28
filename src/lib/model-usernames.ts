const RESERVED_MODEL_USERNAMES = new Set([
  "acesso",
  "admin",
  "api",
  "assets",
  "biblioteca",
  "categorias",
  "checkout",
  "configuracoes",
  "conta",
  "contato",
  "denuncia",
  "favicon.ico",
  "favicon.png",
  "login",
  "logout",
  "minhas-galerias",
  "minhas-modelos",
  "modelo",
  "pagamento",
  "pagamentos",
  "politica-conteudo",
  "privacy",
  "privacidade",
  "pv",
  "reembolso",
  "remocao",
  "robots.txt",
  "sitemap.xml",
  "suporte",
  "termos",
  "webhook",
  "webhooks",
  "www",
]);

export function normalizeModelUsername(value: string): string {
  return value.trim().replace(/^@+/, "").toLocaleLowerCase("pt-BR");
}

export function validateModelUsername(value: string): string | null {
  const username = normalizeModelUsername(value);

  if (!username) return "Informe um nome de usuário.";
  if (username.length < 3) return "O usuário deve ter pelo menos 3 caracteres.";
  if (username.length > 40) return "O usuário deve ter no máximo 40 caracteres.";
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(username)) {
    return "Use apenas letras minúsculas, números, ponto, hífen ou sublinhado.";
  }
  if (RESERVED_MODEL_USERNAMES.has(username)) {
    return `O usuário “${username}” é reservado pelo sistema. Escolha outro.`;
  }

  return null;
}

export function isReservedModelUsername(value: string): boolean {
  return RESERVED_MODEL_USERNAMES.has(normalizeModelUsername(value));
}
