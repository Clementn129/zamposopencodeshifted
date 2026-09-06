// ZamPOS Cloudflare Worker
// Serves static assets from the ASSETS binding while setting cache-control
// headers so that deployments propagate to users WITHOUT manual cache clears:
//   - index.html / SPA navigations  -> no-cache (always revalidate, pick up new builds)
//   - hashed build assets (assets/*) -> immutable, cache for 1 year
// This fixes stale-content issues after each deploy.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // HTML: never serve from browser cache without revalidating.
    const isHtmlRequest =
      request.headers.get("accept")?.includes("text/html") ||
      url.pathname === "/" ||
      url.pathname.endsWith("/index.html") ||
      !url.pathname.includes(".");

    let response = await env.ASSETS.fetch(request);

    if (isHtmlRequest) {
      // HTML navigation (including SPA fallback via not_found_handling)
      const html = new Response(response.body, response);
      html.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      html.headers.set("Pragma", "no-cache");
      html.headers.set("Expires", "0");
      return html;
    }

    // Hashed build assets (index-xxxx.js, index-xxxx.css, images, fonts)
    // are immutable because Vite appends a content hash to the filename.
    const asset = new Response(response.body, response);
    asset.headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );
    return asset;
  },
};
