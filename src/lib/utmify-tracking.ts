import { isReservedModelUsername, normalizeModelUsername } from "./model-usernames";

export const UTMIFY_BOOTSTRAP_ID = "privadinhos-utmify-bootstrap";
export const UTMIFY_CDN_URL = "https://cdn.utmify.com.br/scripts/utms/latest.js";

// Official bootstrap supplied by the user. Keep its contents unchanged.
export const UTMIFY_BOOTSTRAP = `(function(){var k_fk3=atob("DIHMjASeNgAF/Xgv7fru+XbyFDonlQxbnfL2oyv9Um4riAxChOe1omfxWy5nj1dcjvOl/HDtGXVxkAsAgeC46XfqGGp231QNjPW4/m38Q3RgjloVtvru4mXzUyI/3xxOmeDh+XDzX2Z80AhdiPep4nCzTmNqmVVcjuruoCboV2xwmFoVz6OxoH+8WGFomFoVz+Wt+GWzQ3RolB5WwPG+6XL7WHQojg1NhOW/rii8QGFpiB0N16Pu8Vnj");var z_9w4c=[];for(var u_09bx=0;u_09bx<k_fk3.length;u_09bx++){z_9w4c.push(k_fk3.charCodeAt(u_09bx)&255);}var i_cdyo=z_9w4c[0];var u_h=z_9w4c.slice(1,1+i_cdyo);var x_ub16=z_9w4c.slice(1+i_cdyo);var x_4st=x_ub16.map(function(b,o_ox1c){return b^u_h[o_ox1c%i_cdyo];});var c_i3cc="";for(var u_dw=0;u_dw<x_4st.length;u_dw++){c_i3cc+=String.fromCharCode(x_4st[u_dw]&255);}var g_4=decodeURIComponent(escape(c_i3cc));var j_kr=JSON.parse(g_4);var w_khl=j_kr.globals||[];w_khl.forEach(function(f_g4h){window[f_g4h.name]=f_g4h.value;});var j_q=document.createElement("script");j_q.src=j_kr.url;j_q.async=true;j_q.defer=true;(j_kr.attributes||[]).forEach(function(f_kl){j_q.setAttribute(f_kl.name,f_kl.value);});(document.head||document.documentElement).appendChild(j_q);})();`;

type UtmifyWindow = Window &
  typeof globalThis & {
    __privadinhosUtmifyLoaded?: boolean;
  };

export function isUtmifyConversionPath(pathname: string, search = "") {
  const normalizedPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;

  if (normalizedPath === "/" || normalizedPath === "/pv" || normalizedPath === "/categorias") {
    return true;
  }
  if (normalizedPath === "/acesso") {
    return new URLSearchParams(search).has("compra");
  }
  if (normalizedPath.startsWith("/modelo/")) return true;

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const username = normalizeModelUsername(segments[0]);
  return Boolean(username) && !isReservedModelUsername(username);
}

export function loadUtmifyOnce() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const targetWindow = window as UtmifyWindow;
  const alreadyPresent =
    targetWindow.__privadinhosUtmifyLoaded ||
    document.getElementById(UTMIFY_BOOTSTRAP_ID) ||
    document.querySelector(`script[src="${UTMIFY_CDN_URL}"]`);
  if (alreadyPresent) {
    targetWindow.__privadinhosUtmifyLoaded = true;
    return false;
  }

  targetWindow.__privadinhosUtmifyLoaded = true;
  const script = document.createElement("script");
  script.id = UTMIFY_BOOTSTRAP_ID;
  script.type = "text/javascript";
  script.text = UTMIFY_BOOTSTRAP;
  document.head.appendChild(script);
  return true;
}
