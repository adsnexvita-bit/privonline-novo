import { describe, expect, it } from "vitest";
import { PRIMARY_PUBLIC_ORIGIN, publicUrl, resolvePublicOrigin } from "./public-origin";

describe("public origin", () => {
  it("uses the primary domain by default", () => {
    expect(resolvePublicOrigin()).toBe(PRIMARY_PUBLIC_ORIGIN);
    expect(publicUrl("/c/abc")).toBe("https://privadinhos.store/c/abc");
  });

  it("replaces Vercel hosts with the primary domain", () => {
    expect(resolvePublicOrigin("https://privonline.vercel.app/admin/modelos")).toBe(
      PRIMARY_PUBLIC_ORIGIN,
    );
  });

  it("keeps localhost and additional custom domains", () => {
    expect(resolvePublicOrigin("http://127.0.0.1:8080/profile")).toBe("http://127.0.0.1:8080");
    expect(resolvePublicOrigin("https://campanha.example.com/path")).toBe(
      "https://campanha.example.com",
    );
  });
});
