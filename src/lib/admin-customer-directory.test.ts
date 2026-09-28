import { describe, expect, it } from "vitest";
import { toSafeCustomerDirectoryEntry } from "./admin.functions";

function customer(passwordHash: string | null, passwordSalt: string | null) {
  return {
    id: "customer-1",
    name: "Cliente",
    email: null,
    password_hash: passwordHash,
    password_salt: passwordSalt,
  };
}

describe("admin customer password status", () => {
  it("marks a customer with complete credentials as password created", () => {
    expect(toSafeCustomerDirectoryEntry(customer("hash", "salt")).hasAccessPassword).toBe(true);
  });

  it.each([
    [null, null, "checkout account without a password"],
    [null, null, "manual account without a password"],
    ["legacy-incomplete-hash", null, "incomplete legacy credentials"],
  ])("marks %s/%s as not created for %s", (passwordHash, passwordSalt) => {
    expect(toSafeCustomerDirectoryEntry(customer(passwordHash, passwordSalt)).hasAccessPassword).toBe(
      false,
    );
  });

  it("changes to created after credentials are configured", () => {
    const before = toSafeCustomerDirectoryEntry(customer(null, null));
    const after = toSafeCustomerDirectoryEntry(customer("new-hash", "new-salt"));
    expect(before.hasAccessPassword).toBe(false);
    expect(after.hasAccessPassword).toBe(true);
  });

  it("never returns password verifier material to the frontend", () => {
    const entry = toSafeCustomerDirectoryEntry(customer("secret-hash", "secret-salt"));
    expect(entry).not.toHaveProperty("password_hash");
    expect(entry).not.toHaveProperty("password_salt");
    expect(JSON.stringify(entry)).not.toContain("secret");
  });
});
