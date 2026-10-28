# Upstream CI, kept for reference

These are DFO Online's GitHub workflows (Cloudflare deploys, desktop releases, the CI suite). Bunnyfall does not run
them: it is deployed by `selfhost/` on the owner's box. They live here, outside `.github/`, so GitHub never runs them,
and because many upstream tests read them as the record of how the services were meant to be deployed.
