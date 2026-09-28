import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./payment-credentials.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./payment-credentials.server")>();
  return { ...actual, getOnPayCredentials: vi.fn().mockResolvedValue({ apiKey: "api_test", webhookSecret: "whsec_test" }) };
});

import {
  createOnPayCashIn,
  createSyntheticOnPayCpf,
  createSyntheticOnPayEmail,
  mapOnPayStatus,
} from "./onpay.server";

describe("ONPAY PIX", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("envia apenas nome e telefone reais e sintetiza CPF e e-mail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { id: "pay_123", status: "PENDING", amount: 25.9, qrCode: "pix-code" },
    }), { status: 201, headers: { "content-type": "application/json" } }));

    await expect(createOnPayCashIn({
      orderId: "order-123",
      amount: 25.9,
      client: { cpf: "11111111111", email: "real@example.com", name: "Maria Silva", phone: "11999998888" },
    })).resolves.toEqual({ identifier: "pay_123", pixCode: "pix-code" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.payer).toEqual({
      name: "Maria Silva",
      phone: "+5511999998888",
      taxId: createSyntheticOnPayCpf("order-123"),
      email: createSyntheticOnPayEmail("order-123"),
    });
    expect(body.payer.taxId).not.toBe("11111111111");
    expect(body.payer.email).not.toBe("real@example.com");
    expect(init?.headers).toMatchObject({ "x-api-key": "api_test" });
  });

  it("gera dados técnicos estáveis para a idempotência do pedido", () => {
    expect(createSyntheticOnPayCpf("same-order")).toBe(createSyntheticOnPayCpf("same-order"));
    expect(createSyntheticOnPayCpf("same-order")).toMatch(/^\d{11}$/);
    expect(createSyntheticOnPayEmail("same-order")).toBe(createSyntheticOnPayEmail("same-order"));
  });

  it.each([
    ["PENDING", "pending"], ["PAID", "paid"], ["FAILED", "failed"],
    ["EXPIRED", "cancelled"], ["REFUNDED", "refunded"],
  ] as const)("mapeia %s para %s", (input, expected) => {
    expect(mapOnPayStatus(input)).toBe(expected);
  });
});
