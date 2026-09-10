# BillItUp marketing site

A single self-contained static page (`index.html` — all CSS and images are inlined, no build step, no dependencies) for billitup.in. This is separate from the invoicing app itself (`client`/`server`), and only exists to introduce BillItUp and link to the app / GitHub repo.

`assets/` holds the source logo files the page's inlined images were generated from — kept for future edits, not loaded by the page itself.

## Deploying

Any static host works:

- **Cloudflare Pages / Netlify / GitHub Pages** — point it at this folder, deploy `index.html` as-is.
- **Your own server / the Cloudflare Tunnel setup** — serve this folder with any static file server (nginx, `serve`, Caddy) on billitup.in, and point the app itself at a subdomain (e.g. `app.billitup.in`) or a `/app` path.

No environment variables, no build command — it's one HTML file.
