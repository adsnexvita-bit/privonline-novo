import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  campaignLinksForModel,
  campaignTokenForModel,
  resolveCampaignToken,
} from "./campaign-links.server";

describe("campaign links", () => {
  const originalSecret = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = originalSecret;
  });

  it("creates stable opaque tokens for every gateway", () => {
    const first = campaignLinksForModel("model-1");
    const second = campaignLinksForModel("model-1");

    expect(second).toEqual(first);
    expect(first.map((link) => link.provider)).toEqual(["syncpay", "pushinpay", "onpay"]);
    expect(first.every((link) => /^[A-Za-z0-9_-]{16}$/.test(link.token))).toBe(true);
    expect(new Set(first.map((link) => link.token)).size).toBe(first.length);
  });

  it("creates different tokens for different models", () => {
    expect(campaignTokenForModel("model-1", "onpay")).not.toBe(
      campaignTokenForModel("model-2", "onpay"),
    );
  });

  it("resolves a token back to its model and gateway", () => {
    const models = [
      { id: "model-1", username: "ana" },
      { id: "model-2", username: "bia" },
    ];
    const token = campaignTokenForModel("model-2", "syncpay");

    expect(resolveCampaignToken(token, models)).toEqual({
      modelId: "model-2",
      username: "bia",
      provider: "syncpay",
    });
    expect(resolveCampaignToken("not-a-real-token", models)).toBeNull();
  });
});
