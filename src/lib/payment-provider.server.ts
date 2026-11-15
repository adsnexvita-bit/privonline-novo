import {
  amountsMatch,
  createSyncPayCashIn,
  getSyncPayTransactionState,
  mapSyncPayStatus,
} from "./syncpay.server";
import {
  createPushinPayCashIn,
  getPushinPayTransaction,
  mapPushinPayStatus,
} from "./pushinpay.server";
import { GATEWAY_PRODUCT } from "./gateway-product";
import { createOnPayCashIn, getOnPayTransaction, mapOnPayStatus } from "./onpay.server";
import type { PaymentProvider } from "./payment-provider";

export type { PaymentProvider } from "./payment-provider";

export async function createPixCharge(
  provider: PaymentProvider,
  input: {
    orderId: string;
    amount: number;
    webhookOrigin?: string;
    client: { cpf: string; name?: string; email?: string; phone?: string };
  },
) {
  if (provider === "pushinpay") return createPushinPayCashIn(input);
  if (provider === "onpay") return createOnPayCashIn(input);
  return createSyncPayCashIn({ ...input, description: GATEWAY_PRODUCT.description });
}

export async function verifyPixCharge(
  provider: PaymentProvider,
  identifier: string,
  expectedAmount: number,
) {
  if (provider === "pushinpay") {
    const transaction = await getPushinPayTransaction(identifier);
    if (!amountsMatch(expectedAmount, transaction.amount))
      throw new Error("O valor confirmado pela operadora é diferente do valor do pedido.");
    const status = mapPushinPayStatus(transaction.status);
    if (!status) throw new Error("A Pushin Pay retornou um status de pagamento desconhecido.");
    return { status, gatewayStatus: transaction.status, transactionDate: null };
  }
  if (provider === "onpay") {
    const transaction = await getOnPayTransaction(identifier);
    if (transaction.id !== identifier)
      throw new Error("A transação retornada pela ONPAY é diferente da consultada.");
    if (!amountsMatch(expectedAmount, transaction.amount))
      throw new Error("O valor confirmado pela operadora é diferente do valor do pedido.");
    const status = mapOnPayStatus(transaction.status);
    if (!status) throw new Error("A ONPAY retornou um status de pagamento desconhecido.");
    return {
      status,
      gatewayStatus: transaction.status,
      transactionDate: transaction.paidAt ?? null,
    };
  }
  const transaction = await getSyncPayTransactionState(identifier);
  if (!amountsMatch(expectedAmount, transaction.amount))
    throw new Error("O valor confirmado pela operadora é diferente do valor do pedido.");
  const status = transaction.isPaid ? "paid" : mapSyncPayStatus(transaction.providerStatus);
  if (!status) throw new Error("A SyncPay retornou um status de pagamento desconhecido.");
  return {
    status,
    gatewayStatus: transaction.providerStatus,
    transactionDate: transaction.transactionDate,
  };
}
