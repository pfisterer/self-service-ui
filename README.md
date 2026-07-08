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
