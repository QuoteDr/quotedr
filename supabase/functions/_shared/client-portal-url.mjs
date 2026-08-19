// Keep every legacy production hostname here permanently. Adding a new
// primary client-facing domain must be additive; never replace this list.
export const CLIENT_PORTAL_PRODUCTION_HOSTS = Object.freeze([
  "myprojectview.ca",
  "quotedr.io",
  "www.quotedr.io",
]);

export function isProductionClientPortalUrl(url) {
  return url instanceof URL &&
    url.protocol === "https:" &&
    CLIENT_PORTAL_PRODUCTION_HOSTS.includes(url.hostname.toLowerCase()) &&
    (!url.port || url.port === "443");
}

export function portalTokenFromUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const shortMatch = url.pathname.match(/^\/p\/(?:[^/?#]+\/)?([^/?#]+)\/?$/i);
    return String(shortMatch ? decodeURIComponent(shortMatch[1]) : (url.searchParams.get("token") || url.searchParams.get("p") || "")).trim();
  } catch (_) {
    return "";
  }
}
