# Self-Service UI

> Web interface for self-service management of DNS zones, DNS policies, and cloud resources in private cloud environments.

## Overview

The Self-Service UI lets users manage their own DNS names, policies, and cloud
resources from a single interface — without administrative intervention. It is
the frontend for the DHBW private-cloud self-service platform.

### Features

- **DNS management** — create, edit, and delete DNS zones and records
- **Policy configuration** — define and enforce DNS policies, subzones, and delegations
- **Cloud resources** — provision and manage cloud projects and quotas ⚠️ *(WIP)*

> ⚠️ Work in progress — features and APIs may change.

## Related projects

- [dynamic-zones](https://github.com/pfisterer/dynamic-zones) — DNS zones & policy API (backend for DNS management)
- [role-provider-service](https://github.com/pfisterer/role-provider-service) — group/role authorization (Zanzibar-style tuple store)
- [openstack-management-api](https://github.com/pfisterer/openstack-management-api) — cloud project & quota management backend

## Development

**Prerequisites:** Node.js 20+ and npm.

```bash
npm install     # install dependencies
npm run dev     # start dev server (Vite)
npm run build   # build for production
```

See the [Makefile](./Makefile) for more.

## Contributing

Issues and pull requests are welcome.

## License

See [LICENSE](./LICENSE).

## Changelog

Date-versioned; newest first.

- **2026-07-08 — 0.5.8** — More prominent login page; dev-mode login-as-any-user.
- **2026-07-07 — 0.5.3–0.5.7** — Confirm dialog before every delete; searchable DNS records; calmer navigation (no layout jank); first-run home page; show API versions; NS hostname in generated commands.
- **2026-07-06 — 0.5.2** — Subzones, policy delegations, orphaned-zone cleanup, TLS-certificate & `dig` helpers; TLS tab prefilled via OIDC + DHBW ACME server; migrated Preact → React 19 (JSX, Mantine 9, code-splitting).
- **2026-07-01–03 — 0.5.1** — Dropped keel/nginx; Helm-chart JSON schema; updated GitHub Actions.
- **2026-04-23 — 0.4.0-alpha** — Initial cloud project & quota management.
- **2026-03-05** — Migration to Mantine UI.
- **2026-01** — Integrated policy + zones API; Helm chart + GitHub Pages repo; DynDNS self-service.
- **2025-12** — Initial self-service backend integration, routing, and Swagger docs.
