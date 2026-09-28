import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modelsSource = readFileSync(new URL("./models.ts", import.meta.url), "utf8");
const categoriesSource = readFileSync(new URL("./categories.ts", import.meta.url), "utf8");
const accessSource = readFileSync(new URL("./access.functions.ts", import.meta.url), "utf8");
const purchaseSource = readFileSync(new URL("./purchase.functions.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/20260820120000_unlisted_models.sql", import.meta.url),
  "utf8",
);

describe("unlisted model contract", () => {
  it("keeps existing and new models visible by default", () => {
    expect(migration).toContain("show_in_library boolean not null default true");
  });

  it("filters discovery queries, including Home categories and free listings", () => {
    expect(modelsSource.match(/eq\("show_in_library", true\)/g)).toHaveLength(2);
    expect(categoriesSource).toContain('.eq("show_in_library", true)');
  });

  it("does not filter direct profile lookup by library visibility", () => {
    const directLookups = modelsSource.slice(
      modelsSource.indexOf("export async function getPublicModelBySlug"),
      modelsSource.indexOf("export async function listFreeModels"),
    );
    expect(directLookups).not.toContain("show_in_library");
    expect(migration).toContain("where is_active = true");
    expect(migration).not.toContain("where is_active = true and show_in_library");
  });

  it("does not couple checkout or existing customer access to discovery", () => {
    expect(purchaseSource).not.toContain("show_in_library");
    expect(accessSource).not.toContain("show_in_library");
  });
});
