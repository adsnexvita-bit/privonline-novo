import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createTechnicalPayerCpf, customerIdsForPhone } from "./customer-identity.server";
import { normalizeBrazilPhone } from "./phone";
import { chooseSplitPaymentProvider, readCheckoutSettings } from "./checkout-settings.functions";
import type { PaymentProvider } from "./payment-provider.server";
import { parsePaymentProvider } from "./payment-provider";
import { createPasswordCredentials, validateFourDigitPassword } from "./customer-password.server";

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

async function admin(): Promise<SupabaseClient<Database>> {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

async function choosePaymentProvider(
  db: SupabaseClient<Database>,
  override?: PaymentProvider,
): Promise<PaymentProvider> {
  if (override) return override;
  const { data } = await db
    .from("admin_audit_logs")
    .select("details")
    .eq("action", "checkout.settings_update")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const settings = readCheckoutSettings(data?.details);
  if (settings.paymentProviderMode === "pushinpay") return "pushinpay";
  if (settings.paymentProviderMode === "onpay") return "onpay";
  if (settings.paymentProviderMode === "split") return chooseSplitPaymentProvider(settings);
  return "syncpay";
}

export const getPromotionOrderBumps = createServerFn({ method: "POST" })
  .inputValidator((raw: { promotionId: string; modelId: string; sessionToken?: string }) => ({
    promotionId: String(raw?.promotionId ?? ""),
    modelId: String(raw?.modelId ?? ""),
    sessionToken: String(raw?.sessionToken ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!data.promotionId || !data.modelId) throw new Error("Promoção inválida.");
    const db = await admin();
    const looseDb = db as unknown as SupabaseClient;
    const { data: promotion } = await looseDb
      .from("promotions")
      .select(
        "id,is_active,starts_at,ends_at,order_bump_enabled,order_bump_default_price,order_bump_max_visible,order_bump_title,order_bump_description",
      )
      .eq("id", data.promotionId)
      .maybeSingle();
    const now = Date.now();
    if (
      !promotion?.is_active ||
      !promotion.order_bump_enabled ||
      now < new Date(promotion.starts_at).getTime() ||
      (promotion.ends_at && now >= new Date(promotion.ends_at).getTime())
    ) {
      return { enabled: false, title: "", description: "", maxVisible: 0, items: [] };
    }
    let customerIds: string[] = [];
    if (data.sessionToken) {
      const { data: session } = await db
        .from("customer_sessions")
        .select("customer_id,expires_at,customers(phone)")
        .eq("token", data.sessionToken)
        .maybeSingle();
      if (session && new Date(session.expires_at).getTime() > now) {
        const phone = (session as unknown as { customers: { phone: string | null } | null })
          .customers?.phone;
        customerIds = await customerIdsForPhone(db, phone, session.customer_id);
      }
    }
    const { data: rows, error } = await looseDb
      .from("promotion_order_bump_models")
      .select(
        "model_id,price_override,display_order,models(id,name,username,profile_image_path,is_active,price)",
      )
      .eq("promotion_id", data.promotionId)
      .order("display_order", { ascending: true });
    if (error) throw new Error("Não foi possível carregar as ofertas adicionais.");
    let ownedIds = new Set<string>();
    if (customerIds.length) {
      const { data: owned } = await db
        .from("customer_access")
        .select("model_id")
        .in("customer_id", customerIds)
        .eq("access_status", "active")
        .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`);
      ownedIds = new Set((owned ?? []).map((item) => item.model_id));
    }
    const items = (
      (rows ?? []) as unknown as Array<{
        model_id: string;
        price_override: number | null;
        display_order: number;
        models: {
          id: string;
          name: string;
          username: string;
          profile_image_path: string | null;
          is_active: boolean;
          price: number;
        } | null;
      }>
    )
      .filter(
        (item) =>
          item.models?.is_active &&
          item.model_id !== data.modelId &&
          !ownedIds.has(item.model_id) &&
          Number(item.models.price) > 0,
      )
      .map((item) => ({
        id: item.model_id,
        name: item.models!.name,
        username: item.models!.username,
        profileImagePath: item.models!.profile_image_path,
        price: Number(item.price_override ?? promotion.order_bump_default_price),
      }));
    return {
      enabled: true,
      title: String(promotion.order_bump_title),
      description: String(promotion.order_bump_description),
      maxVisible: Number(promotion.order_bump_max_visible),
      items,
    };
  });

export const createPurchase = createServerFn({ method: "POST" })
  .inputValidator(
    (raw: {
      modelId: string;
      planId?: string;
      promotionId?: string;
      orderBumpModelIds?: string[];
      offerId?: string;
      cpf?: string;
      name?: string;
      email?: string;
      phone?: string;
      messageOptIn?: boolean;
      sessionToken?: string;
      instantCheckout?: boolean;
      anonymousCheckout?: boolean;
      offerCode?: string;
      attribution?: Record<string, unknown>;
      gateway?: string;
    }) => {
      const modelId = String(raw?.modelId ?? "");
      const planId = String(raw?.planId ?? "");
      const promotionId = String(raw?.promotionId ?? "");
      const offerId = String(raw?.offerId ?? "");
      const orderBumpModelIds = Array.from(
        new Set((Array.isArray(raw?.orderBumpModelIds) ? raw.orderBumpModelIds : []).map(String)),
      ).filter(Boolean);
      if (orderBumpModelIds.length > 50) throw new Error("Muitas ofertas adicionais selecionadas.");
      if (!modelId) throw new Error("Criador inválido.");
      const sessionToken = String(raw?.sessionToken ?? "");
      const instantCheckout = Boolean(raw?.instantCheckout);
      const anonymousCheckout = Boolean(raw?.anonymousCheckout);
      const offerCode =
        raw?.offerCode === "profile-retention-30" ? "profile-retention-30" : undefined;
      const name = String(raw?.name ?? "")
        .trim()
        .slice(0, 120);
      const email = String(raw?.email ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 160);
      const phone = normalizeBrazilPhone(String(raw?.phone ?? ""));
      if (name && name.length < 2) throw new Error("Nome inválido.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("E-mail inválido.");
      }
      if (!phone) {
        throw new Error("Telefone inválido.");
      }
      const messageOptIn = Boolean(raw?.messageOptIn);
      const attributionKeys = [
        "fbclid",
        "fbc",
        "fbp",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "campaign_id",
        "adset_id",
        "ad_id",
      ] as const;
      const attribution = Object.fromEntries(
        attributionKeys.flatMap((key) => {
          const value = String(raw?.attribution?.[key] ?? "")
            .trim()
            .slice(0, 500);
          return value ? [[key, value]] : [];
        }),
      );
      const gateway = parsePaymentProvider(raw?.gateway);
      return {
        modelId,
        planId,
        promotionId,
        orderBumpModelIds,
        offerId,
        cpf: onlyDigits(String(raw?.cpf ?? "")),
        name,
        email,
        phone,
        messageOptIn,
        sessionToken,
        instantCheckout,
        anonymousCheckout,
        offerCode,
        attribution,
        gateway,
      };
    },
  )
  .handler(async ({ data }) => {
    const db = await admin();
    type SessionCustomer = {
      id: string;
      name: string;
      cpf: string;
      email: string | null;
      phone: string | null;
      is_active: boolean;
    };
    let sessionCustomer: SessionCustomer | null = null;
    if (data.sessionToken) {
      const { data: session } = await db
        .from("customer_sessions")
        .select("expires_at, customers ( id, name, cpf, email, phone, is_active )")
        .eq("token", data.sessionToken)
        .maybeSingle();
      const customer = (
        session as unknown as {
          expires_at: string;
          customers: SessionCustomer | null;
        } | null
      )?.customers;
      if (
        session &&
        customer &&
        customer.is_active &&
        new Date(session.expires_at as string).getTime() > Date.now()
      ) {
        sessionCustomer = customer;
      }
      if (!sessionCustomer) {
        throw new Error("Sua sessão expirou. Entre novamente em Minha conta.");
      }
    }
    const checkoutName = data.name || sessionCustomer?.name || "";
    const checkoutEmail = sessionCustomer?.email ?? data.email;

    if (!sessionCustomer && (data.instantCheckout || data.anonymousCheckout)) {
      if (!data.anonymousCheckout) {
        const { data: setting } = await db
          .from("admin_audit_logs")
          .select("details")
          .eq("action", "checkout.settings_update")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const configured = (setting?.details as Record<string, unknown> | null)
          ?.instant_pix_enabled;
        if (configured === false) {
          throw new Error("Preencha seus dados para continuar.");
        }
      }
    }

    if (checkoutName.trim().length < 2)
      throw new Error("Informe seu nome e sobrenome para continuar.");

    // 1. Load model + price
    const { data: model, error: mErr } = await db
      .from("models")
      .select("id, slug, name, price, is_active")
      .eq("id", data.modelId)
      .maybeSingle();
    if (mErr || !model || !model.is_active) throw new Error("Criador indisponível.");
    let regularPrice = Number(model.price);
    let selectedPlanId: string | null = null;
    let selectedOfferId: string | null = null;
    let selectedPromotionId: string | null = null;
    if (data.promotionId) {
      const promotionClient = db as unknown as {
        from: (table: "promotion_models") => {
          select: (columns: string) => {
            eq: (
              column: string,
              value: string,
            ) => {
              eq: (
                column: string,
                value: string,
              ) => {
                maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
              };
            };
          };
        };
      };
      const { data: assignment, error: promotionError } = await promotionClient
        .from("promotion_models")
        .select("promotion_id, promotions ( id, promotional_price, starts_at, ends_at, is_active )")
        .eq("model_id", model.id)
        .eq("promotion_id", data.promotionId)
        .maybeSingle();
      const promotion = (
        assignment as {
          promotions: {
            id: string;
            promotional_price: number;
            starts_at: string;
            ends_at: string | null;
            is_active: boolean;
          } | null;
        } | null
      )?.promotions;
      const now = Date.now();
      if (
        promotionError ||
        !promotion?.is_active ||
        now < new Date(promotion.starts_at).getTime() ||
        (promotion.ends_at != null && now >= new Date(promotion.ends_at).getTime())
      ) {
        throw new Error("Esta promoção não está disponível para o perfil.");
      }
      regularPrice = Number(promotion.promotional_price);
      selectedPromotionId = promotion.id;
    } else if (data.planId) {
      const { data: assignment, error: planError } = await db
        .from("plan_models")
        .select("plan_id, plans ( id, price, is_active )")
        .eq("model_id", model.id)
        .eq("plan_id", data.planId)
        .maybeSingle();
      const selectedPlan = assignment?.plans as unknown as {
        id: string;
        price: number;
        is_active: boolean;
      } | null;
      if (planError || !selectedPlan?.is_active) {
        throw new Error("Este plano não está disponível para o perfil.");
      }
      regularPrice = Number(selectedPlan.price);
      selectedPlanId = selectedPlan.id;

      if (data.offerId) {
        const { data: selectedOffer, error: offerError } = await db
          .from("plan_offers")
          .select("id,plan_id,price,is_active")
          .eq("id", data.offerId)
          .eq("plan_id", selectedPlan.id)
          .maybeSingle();
        if (offerError || !selectedOffer?.is_active) {
          throw new Error("Esta oferta não está disponível para o perfil.");
        }
        regularPrice = Number(selectedOffer.price);
        selectedOfferId = selectedOffer.id;
      }
    }
    const checkoutPrice =
      !selectedPromotionId && data.offerCode === "profile-retention-30"
        ? Math.max(0.01, Math.round(regularPrice * 0.7 * 100) / 100)
        : regularPrice;

    // 2. Prepare the technical buyer required by the gateway. Checkout never
    // consults the phone directory: that lookup is exclusive to account login.
    // An authenticated session keeps its customer; a guest purchase receives
    // a fresh technical record and proceeds directly to PIX generation.
    const customerId = sessionCustomer?.id ?? null;
    const checkoutCpf = sessionCustomer?.cpf ?? createTechnicalPayerCpf();
    const linkedCustomerIds = customerId ? [customerId] : [];

    // Re-resolve every bump after customer identification. The frontend only
    // sends model ids; prices and eligibility always come from the database.
    let orderBumps: Array<{ modelId: string; name: string; price: number }> = [];
    if (data.orderBumpModelIds.length) {
      if (!selectedPromotionId) throw new Error("Order Bump disponível apenas em promoções.");
      const promotionDb = db as unknown as SupabaseClient;
      const { data: promotionSettings, error: settingsError } = await promotionDb
        .from("promotions")
        .select("order_bump_enabled,order_bump_default_price")
        .eq("id", selectedPromotionId)
        .maybeSingle();
      if (settingsError || !promotionSettings?.order_bump_enabled) {
        throw new Error("O Order Bump desta promoção não está disponível.");
      }
      const { data: configured, error: bumpError } = await promotionDb
        .from("promotion_order_bump_models")
        .select("model_id,price_override,models(id,name,is_active,price)")
        .eq("promotion_id", selectedPromotionId)
        .in("model_id", data.orderBumpModelIds);
      if (bumpError) throw new Error("Não foi possível validar as ofertas adicionais.");
      const { data: owned } = linkedCustomerIds.length
        ? await db
            .from("customer_access")
            .select("model_id")
            .in("customer_id", linkedCustomerIds)
            .eq("access_status", "active")
            .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
            .in("model_id", data.orderBumpModelIds)
        : { data: [] };
      const ownedIds = new Set((owned ?? []).map((item) => item.model_id));
      orderBumps = (
        (configured ?? []) as unknown as Array<{
          model_id: string;
          price_override: number | null;
          models: { id: string; name: string; is_active: boolean; price: number } | null;
        }>
      )
        .filter(
          (item) =>
            item.models?.is_active &&
            item.model_id !== model.id &&
            !ownedIds.has(item.model_id) &&
            Number(item.models.price) > 0,
        )
        .map((item) => ({
          modelId: item.model_id,
          name: item.models!.name,
          price: Number(item.price_override ?? promotionSettings.order_bump_default_price),
        }));
      if (orderBumps.length !== data.orderBumpModelIds.length) {
        throw new Error("Uma das ofertas adicionais não está mais disponível para esta compra.");
      }
    }
    const totalPrice =
      Math.round((checkoutPrice + orderBumps.reduce((sum, item) => sum + item.price, 0)) * 100) /
      100;

    // 3. Choose the configured provider and persist it with the pending order.
    const paymentProvider = await choosePaymentProvider(db, data.gateway);
    const checkoutToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { data: order, error: oErr } = await db
      .from("orders")
      .insert({
        customer_id: customerId,
        checkout_name: checkoutName || null,
        checkout_phone: data.phone,
        normalized_phone: data.phone,
        message_opt_in: data.messageOptIn,
        checkout_token: checkoutToken,
        plan_id: selectedPlanId,
        plan_offer_id: selectedOfferId,
        promotion_id: selectedPromotionId,
        total_amount: totalPrice,
        payment_method: "pix",
        payment_provider: paymentProvider,
        payment_status: "pending",
      })
      .select("id")
      .single();
    if (oErr || !order) {
      // Keep the public checkout message simple, but preserve the database
      // diagnostic in server logs so schema/configuration issues cannot be
      // mistaken for a generic payment failure.
      console.error("[checkout] unable to create pending order", {
        code: oErr?.code,
        message: oErr?.message,
        details: oErr?.details,
        hint: oErr?.hint,
      });
      throw new Error("Falha ao criar pedido.");
    }

    // Attribution is first-party order metadata. It never affects payment
    // creation and is not exposed through public database policies.
    if (Object.keys(data.attribution).length) {
      const { error: attributionError } = await db.from("order_attributions").insert({
        order_id: order.id,
        ...data.attribution,
      });
      if (attributionError) {
        console.error("Could not persist order attribution", {
          orderId: order.id,
          code: attributionError.code,
        });
      }
    }

    // 4. Insert order item
    const { error: iErr } = await db.from("order_items").insert([
      { order_id: order.id, model_id: model.id, unit_price: checkoutPrice, is_order_bump: false },
      ...orderBumps.map((item) => ({
        order_id: order.id,
        model_id: item.modelId,
        unit_price: item.price,
        is_order_bump: true,
      })),
    ]);
    if (iErr) throw new Error("Falha ao registrar item do pedido.");

    // 5. Create the real Pix charge. The order stays pending until its gateway
    // confirms the payment through an authenticated transaction lookup.
    try {
      const { createPixCharge } = await import("./payment-provider.server");
      const { getRequestUrl } = await import("@tanstack/react-start/server");
      const charge = await createPixCharge(paymentProvider, {
        orderId: order.id as string,
        amount: totalPrice,
        webhookOrigin: getRequestUrl().origin,
        client: {
          cpf: checkoutCpf,
          ...(checkoutName ? { name: checkoutName } : {}),
          ...(checkoutEmail ? { email: checkoutEmail } : {}),
          ...(data.phone ? { phone: data.phone } : {}),
        },
      });
      const { error: linkError } = await db
        .from("orders")
        .update({ transaction_identifier: charge.identifier })
        .eq("id", order.id)
        .is("transaction_identifier", null);
      if (linkError) {
        throw new Error("Falha ao vincular a cobrança ao pedido.");
      }
      const { data: linkedOrder } = await db
        .from("orders")
        .select("transaction_identifier")
        .eq("id", order.id)
        .maybeSingle();
      if (linkedOrder?.transaction_identifier !== charge.identifier) {
        throw new Error("A cobrança não pôde ser vinculada com segurança ao pedido.");
      }

      return {
        orderId: order.id as string,
        transactionId: charge.identifier,
        pixCode: charge.pixCode,
        status: "pending" as const,
        amount: totalPrice,
        modelName: model.name as string,
        modelSlug: model.slug as string,
        sessionToken: sessionCustomer ? data.sessionToken : checkoutToken,
        customerId,
        customerName: (checkoutName || sessionCustomer?.name || "Cliente") as string,
      };
    } catch (error) {
      await db
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", order.id)
        .eq("payment_status", "pending");
      throw error;
    }
  });

export const getPurchaseStatus = createServerFn({ method: "POST" })
  .inputValidator((raw: { orderId: string; transactionId: string; sessionToken: string }) => ({
    orderId: String(raw?.orderId ?? ""),
    transactionId: String(raw?.transactionId ?? ""),
    sessionToken: String(raw?.sessionToken ?? ""),
  }))
  .handler(async ({ data }) => {
    return reconcilePurchase(data, false);
  });

export const confirmPurchasePayment = createServerFn({ method: "POST" })
  .inputValidator((raw: { orderId: string; transactionId: string; sessionToken: string }) => ({
    orderId: String(raw?.orderId ?? ""),
    transactionId: String(raw?.transactionId ?? ""),
    sessionToken: String(raw?.sessionToken ?? ""),
  }))
  .handler(async ({ data }) => {
    return reconcilePurchase(data, true);
  });

function paidOrderProofInput(raw: { orderId?: unknown; checkoutToken?: unknown }) {
  const orderId = String(raw?.orderId ?? "");
  const checkoutToken = String(raw?.checkoutToken ?? "");
  if (!orderId || checkoutToken.length < 40) throw new Error("Contexto da compra inválido.");
  return { orderId, checkoutToken };
}

async function loadPaidOrderProof(
  db: SupabaseClient<Database>,
  orderId: string,
  checkoutToken: string,
) {
  const { data: order } = await db
    .from("orders")
    .select(
      "id,customer_id,checkout_name,checkout_phone,normalized_phone,checkout_token,payment_status,paid_at,password_setup_consumed_at,password_setup_expires_at,order_items(model_id,is_order_bump,models(username,name))",
    )
    .eq("id", orderId)
    .eq("checkout_token", checkoutToken)
    .eq("payment_status", "paid")
    .maybeSingle();
  if (!order?.customer_id) throw new Error("Não foi possível validar esta compra.");
  const proofExpiresAt = order.password_setup_expires_at
    ? new Date(order.password_setup_expires_at).getTime()
    : order.paid_at
      ? new Date(order.paid_at).getTime() + 24 * 60 * 60_000
      : 0;
  if (proofExpiresAt <= Date.now()) {
    throw new Error("O prazo para criar ou redefinir a senha expirou. Fale com o suporte.");
  }
  const items =
    (
      order as unknown as {
        order_items: Array<{
          model_id: string;
          is_order_bump: boolean;
          models: { username: string; name: string } | null;
        }>;
      }
    ).order_items ?? [];
  const mainItem = items.find((item) => !item.is_order_bump) ?? items[0];
  if (!mainItem?.models?.username) throw new Error("A modelo desta compra não foi encontrada.");
  return { order, mainItem };
}

export const getPaidOrderAccountContext = createServerFn({ method: "POST" })
  .inputValidator(paidOrderProofInput)
  .handler(async ({ data }) => {
    const db = await admin();
    const { order, mainItem } = await loadPaidOrderProof(db, data.orderId, data.checkoutToken);
    const { data: customer } = await db
      .from("customers")
      .select("name,phone,password_hash")
      .eq("id", order.customer_id!)
      .maybeSingle();
    if (!customer) throw new Error("Conta da compra não encontrada.");
    return {
      name: customer.name || order.checkout_name || "Cliente",
      phone: customer.phone || order.normalized_phone || order.checkout_phone || "",
      hasPassword: Boolean(customer.password_hash),
      canConfigurePassword: !order.password_setup_consumed_at,
      modelUsername: mainItem.models!.username,
      modelName: mainItem.models!.name,
    };
  });

export const configurePaidOrderPassword = createServerFn({ method: "POST" })
  .inputValidator(
    (raw: {
      orderId?: unknown;
      checkoutToken?: unknown;
      password?: unknown;
      passwordConfirmation?: unknown;
    }) => {
      const proof = paidOrderProofInput(raw);
      const password = validateFourDigitPassword(String(raw?.password ?? ""));
      if (password !== String(raw?.passwordConfirmation ?? ""))
        throw new Error("As senhas não são iguais.");
      return { ...proof, password };
    },
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { order, mainItem } = await loadPaidOrderProof(db, data.orderId, data.checkoutToken);
    if (order.password_setup_consumed_at)
      throw new Error("Este link de criação de senha já foi utilizado. Entre com sua senha.");
    const { data: access } = await db
      .from("customer_access")
      .select("id")
      .eq("customer_id", order.customer_id!)
      .eq("model_id", mainItem.model_id)
      .eq("access_status", "active")
      .maybeSingle();
    if (!access) throw new Error("O acesso desta compra ainda não foi confirmado.");

    const { passwordHash, passwordSalt } = await createPasswordCredentials(data.password);
    const consumedAt = new Date().toISOString();
    const { data: claimedOrder } = await db
      .from("orders")
      .update({ password_setup_consumed_at: consumedAt })
      .eq("id", order.id)
      .is("password_setup_consumed_at", null)
      .select("id")
      .maybeSingle();
    if (!claimedOrder)
      throw new Error("Este link de criação de senha já foi utilizado. Entre com sua senha.");
    const { error: passwordError } = await db
      .from("customers")
      .update({
        password_hash: passwordHash,
        password_salt: passwordSalt,
        password_created_at: new Date().toISOString(),
      })
      .eq("id", order.customer_id!);
    if (passwordError) {
      await db
        .from("orders")
        .update({ password_setup_consumed_at: null })
        .eq("id", order.id)
        .eq("password_setup_consumed_at", consumedAt);
      throw new Error("Não foi possível salvar sua senha.");
    }

    const { data: customer } = await db
      .from("customers")
      .select("name")
      .eq("id", order.customer_id!)
      .single();
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error: sessionError } = await db.from("customer_sessions").insert({
      customer_id: order.customer_id!,
      token,
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60_000).toISOString(),
    });
    if (sessionError) throw new Error("Senha criada. Entre novamente para acessar.");
    return {
      token,
      customerId: order.customer_id!,
      name: customer.name,
      modelUsername: mainItem.models!.username,
    };
  });

export const resolvePaidOrderDestination = createServerFn({ method: "POST" })
  .inputValidator(
    (raw: { orderId?: unknown; checkoutToken?: unknown; sessionToken?: unknown }) => ({
      ...paidOrderProofInput(raw),
      sessionToken: String(raw?.sessionToken ?? ""),
    }),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { order, mainItem } = await loadPaidOrderProof(db, data.orderId, data.checkoutToken);
    const { data: session } = await db
      .from("customer_sessions")
      .select("customer_id,expires_at")
      .eq("token", data.sessionToken)
      .maybeSingle();
    if (!session || new Date(session.expires_at).getTime() <= Date.now())
      throw new Error("Sessão inválida ou expirada.");
    const customerIds = await customerIdsForPhone(
      db,
      order.normalized_phone || order.checkout_phone,
      session.customer_id,
    );
    if (!customerIds.includes(order.customer_id!))
      throw new Error("Esta sessão não pertence à compra informada.");
    const { data: access } = await db
      .from("customer_access")
      .select("id")
      .in("customer_id", customerIds)
      .eq("model_id", mainItem.model_id)
      .eq("access_status", "active")
      .limit(1)
      .maybeSingle();
    if (!access) throw new Error("Acesso não confirmado para esta conta.");
    return { modelUsername: mainItem.models!.username };
  });

async function reconcilePurchase(
  data: { orderId: string; transactionId: string; sessionToken: string },
  verifyGateway: boolean,
) {
  if (!data.orderId || !data.transactionId || !data.sessionToken) {
    throw new Error("Pedido inválido.");
  }
  const db = await admin();
  const { data: order, error } = await db
    .from("orders")
    .select(
      "id, customer_id, checkout_token, total_amount, payment_status, payment_provider, order_items ( model_id, models ( slug ) )",
    )
    .eq("id", data.orderId)
    .eq("transaction_identifier", data.transactionId)
    .maybeSingle();
  if (error || !order) throw new Error("Pedido não encontrado.");
  let authenticatedCustomerId: string | null = null;
  if (order.checkout_token !== data.sessionToken) {
    const { data: session } = await db
      .from("customer_sessions")
      .select("customer_id,expires_at")
      .eq("token", data.sessionToken)
      .maybeSingle();
    if (
      !session ||
      new Date(session.expires_at).getTime() <= Date.now() ||
      session.customer_id !== order.customer_id
    ) {
      throw new Error("Pedido não encontrado.");
    }
    authenticatedCustomerId = session.customer_id;
  }
  const item = (
    order as unknown as {
      payment_status: string;
      order_items: Array<{ model_id: string; models: { slug: string } | null }>;
    }
  ).order_items?.[0];

  let status = order.payment_status as string;
  if (verifyGateway) {
    const { processPaymentConfirmation } = await import("./payment-processing.server");
    const processed = await processPaymentConfirmation(db, {
      provider: (order.payment_provider === "pushinpay" || order.payment_provider === "onpay"
        ? order.payment_provider
        : "syncpay") as PaymentProvider,
      transactionId: data.transactionId,
      confirmationSource: "polling",
    });
    status = processed.status;
  }

  if (status === "paid") {
    const { data: paidTiming } = await db
      .from("orders")
      .select("paid_at")
      .eq("id", order.id)
      .single();
    if (paidTiming.paid_at) {
      await db
        .from("orders")
        .update({
          password_setup_expires_at: new Date(
            new Date(paidTiming.paid_at).getTime() + 24 * 60 * 60_000,
          ).toISOString(),
        })
        .eq("id", order.id)
        .is("password_setup_expires_at", null)
        .is("password_setup_consumed_at", null);
    }
  }

  let accountSession: { token: string; customerId: string; customerName: string } | null = null;
  let accountNextStep: "setup_password" | "login" | "open_model" | null = null;
  if (status === "paid") {
    const { data: paidOrder } = await db
      .from("orders")
      .select("customer_id,customers(name,password_hash)")
      .eq("id", order.id)
      .single();
    if (paidOrder.customer_id) {
      const customer = (
        paidOrder as unknown as { customers: { name: string; password_hash: string | null } | null }
      ).customers;
      if (authenticatedCustomerId === paidOrder.customer_id) {
        accountSession = {
          token: data.sessionToken,
          customerId: paidOrder.customer_id,
          customerName: customer?.name ?? "Cliente",
        };
        accountNextStep = "open_model";
      } else {
        accountNextStep = customer?.password_hash ? "login" : "setup_password";
      }
    }
  }
  return {
    status,
    modelSlug: item?.models?.slug ?? "",
    accountSession,
    accountNextStep,
  };
}
