const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/i;

export function sanitizePromotionRichText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?!\/?(?:strong|b|em|i|br|span)(?:\s|\/?>))[^>]+>/gi, "")
    .replace(/<(strong|b|em|i)(?:\s[^>]*)?>/gi, "<$1>")
    .replace(/<br(?:\s[^>]*)?\/?\s*>/gi, "<br>")
    .replace(/<span(?:\s[^>]*)?>/gi, (tag) => {
      const color = tag.match(/color\s*:\s*([^;"']+)/i)?.[1]?.trim();
      return color && SAFE_COLOR.test(color) ? `<span style="color:${color}">` : "<span>";
    });
}

export function promotionTextContent(value: string | null | undefined) {
  return sanitizePromotionRichText(value)
    .replace(/<br>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}
