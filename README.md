# DropNest_Marketing

Marketing site for [DropNest](https://github.com/Deveshsamant/DropBoxx) — static HTML/CSS, no build step.

* `index.html` — landing page (3D nest hero, how it works, features, screens, live prototype, download, FAQ)
* `privacy.html` — privacy policy (the URL both app stores ask for): `https://<domain>/privacy`
* `demo/` — the Claude Design prototype (`DropNest.dc.html` + its runtime), embedded on the landing page and reachable at `/demo`
* `links.js` — store / download links. Empty values show "Coming soon"; paste the Play and Microsoft Store URLs here once the apps are live.
* `assets/` — logo, screenshots (WebP), Open Graph image

## Deploy on Vercel
1. vercel.com → **Add New… → Project** → import `Deveshsamant/DropNest_Marketing`.
2. Framework preset **Other**, root directory `/`, no build command, no output directory. Deploy.
3. Add a custom domain under *Settings → Domains* if you have one.

Every push to `main` redeploys.

## Local preview
```bash
python -m http.server 5173
```
then open http://localhost:5173
