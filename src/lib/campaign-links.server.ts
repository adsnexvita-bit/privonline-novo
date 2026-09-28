import { createHmac } from "node:crypto";
import { PAYMENT_PROVIDERS, type PaymentProvider } from "./payment-provider";

const CAMPAIGN_TOKEN_BYTES = 12;

function campaignSecret() {
  const configured =
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!configured) throw new Error("A chave para gerar links de campanha não está configurada.");
  return configured;
}

export function campaignTokenForModel(modelId: string, provider: PaymentProvider) {
  return createHmac("sha256", campaignSecret())
    .update(`privonline:campaign:v1:${modelId}:${provider}`)
    .digest()
    .subarray(0, CAMPAIGN_TOKEN_BYTES)
    .toString("base64url");
}

export function campaignLinksForModel(modelId: string) {
  return PAYMENT_PROVIDERS.map((provider) => ({
    provider: provider.value,
    token: campaignTokenForModel(modelId, provider.value),
  }));
}

export function resolveCampaignToken(
  token: string,
  models: ReadonlyArray<{ id: string; username: string }>,
) {
  for (const model of models) {
    for (const provider of PAYMENT_PROVIDERS) {
      if (campaignTokenForModel(model.id, provider.value) === token) {
        return { modelId: model.id, username: model.username, provider: provider.value };
      }
    }
  }
  return null;
}
