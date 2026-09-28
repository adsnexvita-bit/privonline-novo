import { describe, expect, it } from "vitest";
import { readProfileSupportEnabled } from "./profile-support-settings.functions";

describe("profile support settings", () => {
  it("keeps support enabled before the first admin configuration", () => {
    expect(readProfileSupportEnabled(null)).toBe(true);
  });

  it("reads the persisted enabled state", () => {
    expect(readProfileSupportEnabled({ enabled: true })).toBe(true);
  });

  it("reads the persisted disabled state", () => {
    expect(readProfileSupportEnabled({ enabled: false })).toBe(false);
  });
});
