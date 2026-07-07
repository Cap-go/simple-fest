# Digital Shift App Instructions

- Use Bun and Bunx for package, script, Capacitor, and CI commands.
- Keep the stack consistent: Astro website, Vue 3, Ionic, Capacitor, Capgo, Cloudflare, and Supabase when persistence or auth is needed.
- Prefer maintained dependencies and platform services over custom code when they cover the use case.
- Keep changes small and remove complexity before adding abstractions.
- Mobile releases go through Capgo: run `bundle releaseType` to decide between OTA and native build.
- Call `notifyAppReady()` after the app is mounted so Capgo can confirm a successful update.
- Cloudflare Pages deploys the website from `website/dist`.
- Cloudflare Workers live under `worker` when backend logic is needed.
- UI should be practical, responsive, accessible, and brand-specific without decorative filler.
- Use real screenshots or product media for website visuals.
- Use subagents for repo audits, migration checks, visual QA, and CI failure triage when work spans multiple apps.
