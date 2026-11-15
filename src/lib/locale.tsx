import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type PublicLocale = "pt-BR" | "es";

const LocaleContext = createContext<PublicLocale>("pt-BR");

function detectLocale(): PublicLocale {
  return "es";
}

export function PublicLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<PublicLocale>("es");

  useEffect(() => {
    const detected = detectLocale();
    setLocale(detected);
    document.documentElement.lang = detected === "es" ? "es" : "pt-BR";
  }, []);

  const value = useMemo(() => locale, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function usePublicLocale() {
  return useContext(LocaleContext);
}

export function usePublicText() {
  const locale = usePublicLocale();
  return locale === "es" ? esText : ptText;
}

const publicTranslations: Record<string, string> = {
  "Todo o portfólio de criadores disponíveis na plataforma.": "Todo el catálogo de creadores disponibles en la plataforma.",
  "Buscar por nome ou usuário": "Buscar por nombre o usuario",
  Destaques: "Destacados",
  "Mais recentes": "Más recientes",
  "Menor preço": "Precio más bajo",
  "Maior preço": "Precio más alto",
  Anterior: "Anterior",
  "Próxima": "Siguiente",
  Página: "Página",
  de: "de",
  "Nenhum criador encontrado": "No se encontraron creadores",
  "Tente ajustar a busca ou o filtro de ordenação.": "Intenta ajustar la búsqueda o el filtro de ordenación.",
  "Ainda não há criadores disponíveis. Volte em breve.": "Aún no hay creadores disponibles. Vuelve pronto.",
  "Limpar filtros": "Limpiar filtros",
  "Não conseguimos carregar a biblioteca": "No pudimos cargar la biblioteca",
  "Verifique sua conexão e tente novamente.": "Comprueba tu conexión e inténtalo de nuevo.",
  Categorias: "Categorías",
  "Encontre rapidamente o tipo de galeria que deseja explorar.": "Encuentra rápidamente el tipo de galería que quieres explorar.",
  perfil: "perfil",
  perfis: "perfiles",
  "Nenhuma categoria disponível no momento.": "No hay categorías disponibles en este momento.",
  "Minha conta": "Mi cuenta",
  "Acesse suas galerias usando telefone e senha.": "Accede a tus galerías con tu teléfono y contraseña.",
  "Informe um telefone válido com DDD.": "Informa un teléfono válido con código de área.",
  "A senha deve ter exatamente 4 números.": "La contraseña debe tener exactamente 4 números.",
  "As senhas não são iguais.": "Las contraseñas no coinciden.",
  "Falha ao acessar": "No se pudo acceder",
  "Seu acesso já está liberado. Crie sua senha para entrar quando quiser.": "Tu acceso ya está liberado. Crea tu contraseña para entrar cuando quieras.",
  "Crie sua conta para acompanhar suas compras e galerias em um só lugar.": "Crea tu cuenta para seguir tus compras y galerías en un solo lugar.",
  "Entre com seu telefone e sua senha de 4 números.": "Entra con tu teléfono y tu contraseña de 4 números.",
  "Você está conectado como": "Has iniciado sesión como",
  "Ir para minhas galerias": "Ir a mis galerías",
  "Validando sua compra…": "Validando tu compra…",
  "Falta só criar sua senha": "Solo falta crear tu contraseña",
  "Use 4 números fáceis de lembrar para acessar seus conteúdos novamente.": "Usa 4 números fáciles de recordar para volver a acceder a tus contenidos.",
  Entrar: "Entrar",
  "Criar conta": "Crear cuenta",
  "Esqueceu sua senha?": "¿Olvidaste tu contraseña?",
  "Nome completo": "Nombre completo",
  "Digite seu nome": "Escribe tu nombre",
  Senha: "Contraseña",
  "Senha de 4 números": "Contraseña de 4 números",
  "Confirme sua senha": "Confirma tu contraseña",
  "Repetir a senha": "Repite la contraseña",
  "Acessar conta": "Acceder a la cuenta",
  "Criar minha conta": "Crear mi cuenta",
  "Minhas Galerias": "Mis galerías",
  "Acompanhe as galerias de criadores que você já adquiriu na Privadinhos Online.": "Consulta las galerías de creadores que ya adquiriste en Privadinhos Online.",
  "Acesse com seu telefone para ver as galerias liberadas.": "Accede con tu teléfono para ver las galerías liberadas.",
  "Erro ao carregar": "Error al cargar",
  "Liberado em": "Liberado el",
  "Entre na sua conta": "Entra en tu cuenta",
  "Você precisa acessar sua conta para ver suas galerias adquiridas.": "Debes entrar en tu cuenta para ver tus galerías adquiridas.",
  "Nenhuma galeria adquirida ainda": "Todavía no has adquirido ninguna galería",
  "Quando você comprar uma galeria, ela aparecerá aqui.": "Cuando compres una galería, aparecerá aquí.",
  "Explorar biblioteca": "Explorar biblioteca",
  "Não conseguimos carregar suas galerias": "No pudimos cargar tus galerías",
  "Documento legal": "Documento legal",
  "Última atualização": "Última actualización",
  "Ver perfil": "Ver perfil",
  "Ver conteúdos": "Ver contenido",
  "conteúdos secretos": "contenidos secretos",
  "Tentar novamente": "Intentar de nuevo",
  "Acessar conteúdo": "Acceder al contenido",
  "Olá,": "Hola,",
  "Suas galerias liberadas aparecem aqui.": "Tus galerías desbloqueadas aparecen aquí.",
  "Sair": "Salir",
  "Suas galerias adquiridas ficam disponíveis após validar o telefone utilizado na compra.": "Tus galerías adquiridas estarán disponibles después de validar el teléfono usado en la compra.",
  "Ir para Minha conta": "Ir a Mi cuenta",
  "Explore a biblioteca e adquira acesso vitalício às galerias dos seus criadores favoritos.": "Explora la biblioteca y adquiere acceso de por vida a las galerías de tus creadores favoritos.",
  "Nenhum webhook recebido ainda.": "Aún no se recibió ningún webhook.",
};

export function translatePublic(value: string, locale: PublicLocale): string {
  return locale === "es" ? publicTranslations[value] ?? value : value;
}

const ptText = {
  nav: {
    library: "Biblioteca",
    categories: "Categorias",
    myGalleries: "Minhas Galerias",
    myAccount: "Minha conta",
    logout: "Sair",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    mainMenu: "Menu principal",
    home: "Ir para a página inicial",
  },
  footer: {
    rights: "Todos os direitos reservados.",
  },
  ageGate: {
    title: "Confirmação de Idade",
    body: "Por favor, confirme sua idade para continuar.",
    button: "Tenho mais de 18 anos",
    privacy: "Política de Privacidade",
    terms: "Termos de Uso",
  },
  profile: {
    back: "Voltar",
    verified: "Perfil verificado",
    availableNow: "Disponível agora",
    moreInfo: "Mais informações",
    unlockedContent: "Conteúdos liberados",
    previewContent: "Prévia do conteúdo",
    posts: "POSTS",
    media: "MÍDIAS",
    noGallery: "Não foi possível carregar a galeria.",
    loadingPosts: "Carregando postagens…",
    noPosts: "Não foi possível carregar as postagens.",
    tryAgain: "Tentar novamente",
    noMediaTitle: "Nenhuma mídia publicada",
    noMediaBody: "As prévias selecionadas para este perfil aparecerão aqui.",
    about: "Sobre",
    supportTitle: "Comprou e teve problemas em seu acesso? Entre em contato conosco",
    contact: "Entrar em contato",
    instagramBody: "Acompanhe conteúdos e novidades no Instagram",
    instagramButton: "Ver perfil no Instagram",
    subscription: "Assinatura",
    oneMonth: "1 MÊS",
    lifetime: "ACESSO VITALÍCIO",
    filters: {
      posts: "Posts",
      videos: "Vídeos",
      photos: "Fotos",
      released: "Conteúdos liberados",
      watchVideo: "Assistir vídeo",
      openPhoto: "Abrir foto",
      empty: (kind: "video" | "image") =>
        `Nenhum ${kind === "video" ? "vídeo" : "conteúdo"} publicado ainda.`,
    },
    preview: {
      unlock: "Liberar acesso a esta prévia",
      open: "Abrir mídia",
      exclusive: "Exclusivo",
    },
    login: {
      title: "Acesse com seu telefone para curtir",
      body: "Suas curtidas ficam salvas na sua conta. Informe o telefone utilizado na compra para continuar.",
      later: "Agora não",
      access: "Ir para /acesso",
    },
    audio: {
      soundOn: "Ativar som",
      mute: "Silenciar",
      close: "Fechar",
    },
  },
  checkout: {
    close: "Fechar",
    unavailable:
      "O pagamento está temporariamente indisponível. Aguarde alguns instantes e tente novamente.",
    failure: "Falha ao gerar pagamento. Tente novamente.",
    expiredSession: "Sua sessão expirou. Entre novamente em Minha conta.",
    notPaidYet:
      "Ainda não consta o pagamento no sistema. Caso já tenha pagado, espere mais alguns segundos e tente novamente. Caso ainda não tenha pago, efetue o pagamento.",
    cannotConfirm: "Não foi possível confirmar agora. Aguarde alguns segundos e tente novamente.",
    missingName: "Informe seu nome e sobrenome.",
    invalidPhone: "Informe um telefone válido com DDD.",
    generatingPix: "Gerando PIX...",
    unlockTitle: (name: string) => `🔥 Desbloqueie acesso aos conteúdos de ${name}`,
    unlockBody: (name: string) =>
      `Informe seu nome e telefone para gerar o PIX e liberar o acesso ao conteúdo de ${name}.`,
    nameLabel: "Nome e sobrenome",
    namePlaceholder: "Como podemos te chamar?",
    phoneLabel: "Telefone",
    phoneHelp:
      "Usaremos seu telefone para identificar sua compra e liberar o acesso com segurança.",
    whatsappOptIn: "Quero receber mensagens e novidades pelo WhatsApp.",
    lifetimeAccess: "Acesso vitalício",
    added: "✓ Adicionado",
    add: "+ Adicionar",
    seeLessModels: "Ver menos modelos",
    seeMoreModels: "Ver mais modelos",
    mainPromotion: "Promoção principal",
    total: "Total",
    usePromotion: "Aproveitar promoção",
    generatePix: "Gerar PIX",
    guarantee: (time: string) => `Garanta seu acesso nos próximos ${time}`,
    expiredOffer: "Tempo encerrado, pague agora para não perder descontos especiais",
    gift: "🎁 Pague agora e receba meu contato exclusivo de presente.",
    pixTitle: (price: string) => `QR Code Pix de ${price}`,
    copiedPix: "✓ CÓDIGO PIX COPIADO",
    copyPix: "📋 COPIAR CÓDIGO PIX",
    securePayment: "🔒 Pagamento seguro",
    automaticRelease: "⚡ Liberação automática",
    confirmingPayment: "Confirmando pagamento...",
    checkPayment: "Verificar pagamento",
    approved: "Pagamento aprovado",
    accessReleased: "Seu acesso está liberado",
    approvedBody: (name: string) =>
      `A galeria de ${name} já pertence à sua conta e ficará disponível permanentemente em Minhas Galerias.`,
    access: "Acessar",
    optional: "opcional",
  },
} as const;

const esText: any = {
  nav: {
    library: "Biblioteca",
    categories: "Categorías",
    myGalleries: "Mis galerías",
    myAccount: "Mi cuenta",
    logout: "Salir",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    mainMenu: "Menú principal",
    home: "Ir a la página inicial",
  },
  footer: {
    rights: "Todos los derechos reservados.",
  },
  ageGate: {
    title: "Confirmación de edad",
    body: "Por favor, confirma tu edad para continuar.",
    button: "Tengo más de 18 años",
    privacy: "Política de privacidad",
    terms: "Términos de uso",
  },
  profile: {
    back: "Volver",
    verified: "Perfil verificado",
    availableNow: "Disponible ahora",
    moreInfo: "Más información",
    unlockedContent: "Contenidos liberados",
    previewContent: "Vista previa del contenido",
    posts: "POSTS",
    media: "MEDIOS",
    noGallery: "No fue posible cargar la galería.",
    loadingPosts: "Cargando publicaciones…",
    noPosts: "No fue posible cargar las publicaciones.",
    tryAgain: "Intentar de nuevo",
    noMediaTitle: "No hay medios publicados",
    noMediaBody: "Las vistas previas seleccionadas para este perfil aparecerán aquí.",
    about: "Sobre",
    supportTitle: "¿Compraste y tuviste problemas con el acceso? Contáctanos",
    contact: "Contactar",
    instagramBody: "Sigue contenidos y novedades en Instagram",
    instagramButton: "Ver perfil en Instagram",
    subscription: "Suscripción",
    oneMonth: "1 MES",
    lifetime: "ACCESO VITALICIO",
    filters: {
      posts: "Posts",
      videos: "Videos",
      photos: "Fotos",
      released: "Contenidos liberados",
      watchVideo: "Ver video",
      openPhoto: "Abrir foto",
      empty: (kind: "video" | "image") =>
        `No hay ${kind === "video" ? "videos" : "contenido"} publicado todavía.`,
    },
    preview: {
      unlock: "Liberar acceso a esta vista previa",
      open: "Abrir medio",
      exclusive: "Exclusivo",
    },
    login: {
      title: "Accede con tu teléfono para dar me gusta",
      body: "Tus me gusta quedan guardados en tu cuenta. Informa el teléfono usado en la compra para continuar.",
      later: "Ahora no",
      access: "Ir a /acesso",
    },
    audio: {
      soundOn: "Activar sonido",
      mute: "Silenciar",
      close: "Cerrar",
    },
  },
  checkout: {
    close: "Cerrar",
    unavailable:
      "El pago no está disponible temporalmente. Espera unos instantes e inténtalo de nuevo.",
    failure: "No se pudo generar el pago. Inténtalo de nuevo.",
    expiredSession: "Tu sesión expiró. Entra nuevamente en Mi cuenta.",
    notPaidYet:
      "El pago aún no aparece en el sistema. Si ya pagaste, espera unos segundos e inténtalo de nuevo. Si todavía no pagaste, realiza el pago.",
    cannotConfirm: "No fue posible confirmar ahora. Espera unos segundos e inténtalo de nuevo.",
    missingName: "Informa tu nombre y apellido.",
    invalidPhone: "Informa un teléfono válido con código de área.",
    generatingPix: "Generando PIX...",
    unlockTitle: (name: string) => `🔥 Desbloquea el acceso al contenido de ${name}`,
    unlockBody: (name: string) =>
      `Informa tu nombre y teléfono para generar el PIX y liberar el acceso al contenido de ${name}.`,
    nameLabel: "Nombre y apellido",
    namePlaceholder: "¿Cómo podemos llamarte?",
    phoneLabel: "Teléfono",
    phoneHelp: "Usaremos tu teléfono para identificar tu compra y liberar el acceso con seguridad.",
    whatsappOptIn: "Quiero recibir mensajes y novedades por WhatsApp.",
    lifetimeAccess: "Acceso vitalicio",
    added: "✓ Agregado",
    add: "+ Agregar",
    seeLessModels: "Ver menos modelos",
    seeMoreModels: "Ver más modelos",
    mainPromotion: "Promoción principal",
    total: "Total",
    usePromotion: "Aprovechar promoción",
    generatePix: "Generar PIX",
    guarantee: (time: string) => `Garantiza tu acceso en los próximos ${time}`,
    expiredOffer: "Tiempo agotado, paga ahora para no perder descuentos especiales",
    gift: "🎁 Paga ahora y recibe mi contacto exclusivo de regalo.",
    pixTitle: (price: string) => `Código QR Pix de ${price}`,
    copiedPix: "✓ CÓDIGO PIX COPIADO",
    copyPix: "📋 COPIAR CÓDIGO PIX",
    securePayment: "🔒 Pago seguro",
    automaticRelease: "⚡ Liberación automática",
    confirmingPayment: "Confirmando pago...",
    checkPayment: "Verificar pago",
    approved: "Pago aprobado",
    accessReleased: "Tu acceso está liberado",
    approvedBody: (name: string) =>
      `La galería de ${name} ya pertenece a tu cuenta y quedará disponible permanentemente en Mis galerías.`,
    access: "Acceder",
    optional: "opcional",
  },
};
