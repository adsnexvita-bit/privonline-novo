import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encryptMetaAccessToken,
  getMetaCapiCredentials,
} from "./meta-capi-credentials.server";

const originalEncryptionKey = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;
const originalPixelId = process.env.META_PIXEL_ID;
const originalAccessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function databaseWith(details: Record<string, unknown>) {
  const result = { data: { details }, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain };
}

describe("Meta CAPI credentials", () => {
  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    delete process.env.META_PIXEL_ID;
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
  });

  afterEach(() => {
    restoreEnvironment("PAYMENT_CREDENTIALS_ENCRYPTION_KEY", originalEncryptionKey);
    restoreEnvironment("META_PIXEL_ID", originalPixelId);
    restoreEnvironment("META_CONVERSIONS_API_ACCESS_TOKEN", originalAccessToken);
  });

  it("uses the latest encrypted credentials saved by the admin", async () => {
    const encryptedToken = encryptMetaAccessToken("meta-secret-token");
    const credentials = await getMetaCapiCredentials(
      databaseWith({
        pixel_id: "123456789012345",
        access_token_encrypted: encryptedToken,
        access_token_hint: "••••oken",
      }) as never,
    );

    expect(credentials).toEqual({
      pixelId: "123456789012345",
      accessToken: "meta-secret-token",
      tokenHint: "••••oken",
    });
  });

  it("keeps environment credentials as a safe fallback", async () => {
    process.env.META_PIXEL_ID = "987654321";
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "fallback-token";

    const credentials = await getMetaCapiCredentials(databaseWith({}) as never);

    expect(credentials.pixelId).toBe("987654321");
    expect(credentials.accessToken).toBe("fallback-token");
    expect(credentials.tokenHint).toBe("••••oken");
  });
});
