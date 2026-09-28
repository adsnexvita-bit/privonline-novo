import { afterEach, describe, expect, it } from "vitest";
import { captureMarketingAttribution, getMarketingAttribution } from "./marketing-attribution";
import {
  UTMIFY_BOOTSTRAP,
  UTMIFY_CDN_URL,
  isUtmifyConversionPath,
  loadUtmifyOnce,
} from "./utmify-tracking";

describe("UTMify tracking scope", () => {
  it.each(["/", "/pv", "/categorias", "/leticiadisher", "/modelo/leticia"])(
    "loads on conversion route %s",
    (pathname) => expect(isUtmifyConversionPath(pathname)).toBe(true),
  );

  it("loads on the post-purchase account step only", () => {
    expect(isUtmifyConversionPath("/acesso", "?compra=aprovada")).toBe(true);
    expect(isUtmifyConversionPath("/acesso")).toBe(false);
  });

  it.each([
    "/admin",
    "/admin/configuracoes/pagamentos",
    "/biblioteca",
    "/minhas-modelos",
    "/acesso",
    "/privacidade",
  ])("does not load on excluded route %s", (pathname) => {
    expect(isUtmifyConversionPath(pathname)).toBe(false);
  });

  it("keeps the official CDN and bootstrap attributes", () => {
    expect(UTMIFY_CDN_URL).toBe("https://cdn.utmify.com.br/scripts/utms/latest.js");
    const encoded = UTMIFY_BOOTSTRAP.match(/atob\("([^"]+)"\)/)?.[1];
    expect(encoded).toBeTruthy();
    const bytes = Buffer.from(encoded!, "base64");
    const keyLength = bytes[0];
    const key = bytes.subarray(1, 1 + keyLength);
    const encrypted = bytes.subarray(1 + keyLength);
    const decoded = Buffer.from(encrypted.map((value, index) => value ^ key[index % keyLength]));
    const config = JSON.parse(decoded.toString("utf8")) as {
      url: string;
      attributes: Array<{ name: string }>;
    };

    expect(config.url).toBe(UTMIFY_CDN_URL);
    expect(config.attributes.map(({ name }) => name)).toEqual([
      "data-utmify-prevent-xcod-sck",
      "data-utmify-prevent-subids",
    ]);
  });
});

describe("UTMify singleton loader", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  });

  it("inserts the official bootstrap only once", () => {
    const appended: Array<Record<string, unknown>> = [];
    const fakeWindow = {};
    const fakeDocument = {
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({}),
      head: { appendChild: (element: Record<string, unknown>) => appended.push(element) },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });

    expect(loadUtmifyOnce()).toBe(true);
    expect(loadUtmifyOnce()).toBe(false);
    expect(appended).toHaveLength(1);
    expect(appended[0].text).toBe(UTMIFY_BOOTSTRAP);
  });
});

describe("campaign persistence across SPA navigation", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalSessionStorage = globalThis.sessionStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
  });

  it("keeps captured UTMs after the URL no longer contains them", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const location = {
      search:
        "?utm_source=facebook&utm_medium=paid&utm_campaign=teste&utm_content=criativo01&utm_term=video",
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location, sessionStorage: storage },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { cookie: "" },
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: storage,
    });

    captureMarketingAttribution();
    location.search = "";

    expect(getMarketingAttribution()).toMatchObject({
      utm_source: "facebook",
      utm_medium: "paid",
      utm_campaign: "teste",
      utm_content: "criativo01",
      utm_term: "video",
    });
  });
});
