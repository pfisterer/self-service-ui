# dhbwCloud Self Service

## Why

Getting a virtual machine or a DNS name at a university usually means writing an
email and waiting. Someone with administrative rights reads it, decides, clicks it
together by hand, and answers — if they have time.

Where a default allocation exists at all, it rarely matches what the work actually
needs: too small for a course with 24 students, far too large for a one-afternoon
demo, and never the right storage. So almost every real request leaves the default
behind — and lands in a ticket queue, which means waiting again, this time for
someone who has to understand the request before they can size it.

The deeper problem is that the deciding happens centrally. A handful of people in
the data centre approve capacity for an entire university, although the person who
knows whether a request is reasonable is usually the lecturer who set the
assignment, not an administrator reading a ticket. Central allocation is not a
policy anyone chose; it is what happens when the platform has no way to hand
authority over resources to someone else.

This platform gives it that way. Capacity is handed out as **delegated pools**: a department gets a share it may pass on, a lecturer carves out a slice for a course and decides on requests against it, without asking the data centre. And for the common small case, nobody needs to decide at all — a pool can **approve requests on its own** — up to the whole budget, or up to a fixed share per person — so they are granted immediately and only what exceeds that reaches a human.

This is the web interface for that: people request what they need, whoever owns the
budget decides — or the policy decides for them — and both sides can see the state
and its history at any time.

## What it does

Up to three areas and the credentials for them, behind one login. The home page has one card per area the person can use, each with the button that gets them started there.

**Cloud Projects** — resources are handed out along a *budget tree*. A budget is a delegated pool of capacity; passing capacity on means creating a sub-budget with someone else as its manager. A project is a leaf: a concrete allocation with one owner, which the platform turns into a real OpenStack project. The owner can share its administration with *project admins* — people or groups who may rename it, request changes and release it, and who find it on their *My Projects* page too. Requests, the approval of them, adjusted approvals, changes, moves, owner transfers and release all live here, and each node keeps its own history; every project status explains itself on hover, because "Released" asks for deletion rather than performing it. What release leads to depends on the deployment — the project is archived (shut down, its data kept) or marked for deletion — and where the deployment deletes on request, a released or archived project can be deleted for good once its name is typed in.

Each budget and each project has one dialog: editable for whoever may change it, read-only with the same tabs for everyone else, with its history and its usage as further tabs. The usage tab shows what was actually used — server, vCPU and RAM hours, storage, public IPv4 — over 30, 90 or 365 days or the whole lifetime, with a daily chart and how much of what was reserved was used; a budget's tab also lists the projects that used most and those that used least of what they reserved, and a project that ran nothing for 30 days says so. Managers can attach *attributes* to a budget or project in a tab of their own: free-form groups of facts such as a cost centre, which the nodes below inherit group by group unless they set the group themselves. The platform does not interpret them; they are there for whoever bills.

A budget with auto-approval grants requests on the spot — as a pool until the budget is used up, or with individual limits per person — and later changes to a project that stay within it take effect at once too; giving resources back, ending sooner and changing members never wait. A budget can also refuse whatever its auto-approve does not cover, so nothing waits for a manager and its share becomes a hard limit. It can leave extensions to its managers while still granting new projects on the spot. A budget that only structures the tree can use the limit of the budget above instead of a share of its own. A budget may limit how long its projects run at a time — six months for a student budget, say: a project then ends at most that long after it is requested or extended and never after the budget itself, lowering the limit shortens the projects below, and where nothing limits a project it may run without an end. Exceptions do not need a new budget: a manager further up can give a single project an *allocation* from their budget — a GPU, a network, more cores than its own budget grants — which counts only against that budget and above; the project card shows which budget pays for what, the table marks such projects, and the allocating budget lists them however deep they lie. The project's owner can give an allocation back. Every end date and duration is entered the same way, as a date or a span with shortcuts for three, six and twelve months. While a form is filled in it says what the button will do: create the project right away, or send it to the budget's managers, who are named. The budgets someone may draw from appear as cards on *My Projects*, below their projects, each saying how much is theirs right away — or, when nothing is, whether their own projects hold their share or the budget is used up; *My Budgets* is shown only to people who manage a budget. The request dialogs show how much of the funding budget is still free and what share the entered values take. Resources are either quantities or *availabilities*, which are only granted or withheld and therefore get a switch instead of a number; each form offers only what the budget above it was delegated. Wherever people or groups are added, a whole list can be imported at once — pasted, or as a CSV or text file dropped onto the dialog — with a preview that has to be free of invalid and duplicate entries before anything is added. Managers can adopt OpenStack projects that exist outside the managed lifecycle. Root admins get a page each for the state of the OpenStack reconciliation (including the problems of its recent runs), for the availabilities the catalogue offers, and for an evaluation of what all projects used, grouped by project, budget, the first or second level of the tree or by attributes, and downloadable as CSV with the attributes and what was reserved. Where the API permits it, a role switch shows the section as a given group or person would see it.

**DNS Zones** — self-service DNS. Users create zones they are entitled to by policy, edit records in the browser, and get per-zone TSIG keys so that Kubernetes, `external-dns` or `cert-manager` can keep the records up to date via RFC 2136 without a human in the loop. A zone the platform reports a problem with — a client failing TSIG in a loop, for example — carries a warning in the zone list and a banner on its page, and a dot in the navigation points to it. Whoever a policy rule applies to also gets an *Administration* page with the rules and the zones delegated to them; super admins additionally see delegations, orphaned zones and every active zone event, with a pre-filled mail to the zone's owners.

**API Tokens** — one place for every credential a script, a CI job or an AI assistant uses, with a tab per issuing API (both APIs issue their own, and a credential has to be findable in one place to be revocable in a hurry). A token carries a note, a lifetime of choice (including none) and optionally read-only access, and the list shows when it was last used, which is what makes revoking one safe. Where the deployment configures an API's MCP endpoint, the tab also shows that address and a ready-made MCP server entry to paste into an existing client configuration.

**Language Models** — the front end of a separate LLM service (llm-management-api), shown only where the deployment configures it and only to people its access rules let in; the service decides, this app reads the answer. An overview explains the OpenAI-compatible endpoint and the tools that work with it and links the chat; people create and delete their own API keys for the model endpoint (with a ready-made VS Code setup right after creating one) and see their spend against their quota. Fleet admins see the machines that serve the models and download what enrols new ones; admins manage the access rules. These keys belong to the model endpoint and are a different thing from the platform's API tokens.

Every area also includes the interactive API documentation of the service behind it.

**Language** — English and German, switched in the header and remembered in the browser (no account setting, nothing for a deployment to configure). The first visit follows the browser's language. Dates, relative times and the calendar follow the choice: 31.03.2027 in German, 31 Mar 2027 in English. The translation is being moved area by area; anything not translated yet stays English.

## Screenshots

### Cloud Projects

**My Projects** — first the projects a person owns, then those they administer with someone else (marked *Shared*): what they cost, which budget pays for them, who has access and who administers them, and what a pending change would do. Below them, set apart, the budgets they may draw from for new ones, each saying how much is theirs right away and whether a project there needs an approval.

![My Projects](docs/img/01-my-projects.webp)

**Requesting a project** — the budget to pay from comes first. While the form is filled in, it says what the button will do: create the project right away, or send it to the budget's managers. Where a budget grants a fixed share per person on its own, the form starts filled with exactly what goes through instantly.

![Requesting a project](docs/img/02-request-project.webp)

**Access and project admins** — the *Members* tab has two separate boxes. *Access in OpenStack* is who gets into the project there, and with which role; *Project admins* administer the project here together with the owner, which gives them no access in OpenStack.

![Access in OpenStack and project admins](docs/img/15-project-admins.webp)

**Importing a list** — every list of people or groups takes a pasted list or a CSV/text file as well. The preview picks the columns (a header is recognised, and roles are taken from a role column), marks each entry as new, duplicate, invalid or already on the list, and adds nothing until every remaining entry can be added.

![Importing a list of members](docs/img/16-import-list.webp)

**My Budgets** — the tree resources are paid from, shown to people who manage a budget. The tree holds budgets only, each with the number of projects it pays for; selecting one shows its usage, who manages it and who may request from it, and below that a table of its projects. The table filters by text, status and group — a group either has access to the project or contains its owner, so "the projects of everyone in `group:standort-ma#studierende`" is one filter — and pages on the server, so a budget with hundreds of student projects stays usable. A switch takes in the projects of the sub-budgets too, and the browser remembers it. Each resource has a column with what is in use above what was granted, plus the number of running VMs; the table sorts by name, owner, status, end date and by either line of every resource column, and where it is too narrow for those columns each row folds them into an (i). Each row carries every action the project allows as an icon of its own; clicking a row opens the full project card in a dialog. Budgets someone may only request from appear read-only, marked with an eye.

![My Budgets](docs/img/03-budget-tree.webp)

**Delegating** — passing capacity on means creating a sub-budget with someone else under *Managed by*; *Who can request here* decides who may ask it for projects.

![Delegating by creating a sub-budget](docs/img/04-delegate.webp)

**Approving a request** — straight from the project table or the *Waiting* list, the manager sees what it would do to the funding budget before deciding, and can grant a smaller amount instead of rejecting.

![Approving a request](docs/img/05-approve-impact.webp)

**Approving without a manager** — with auto-approve on, requests go through as long as the budget has room; with individual limits, each person gets a fixed share, the setup for a course.

![Auto-approve with individual limits](docs/img/06-auto-approve.webp)

**Requesting a budget** — each amount shows how much the source budget still has free and what share of it the request would take.

![Requesting a budget](docs/img/07-request-budget.webp)

**Root Admin** — one page each for the reconciliation, the availabilities and the usage evaluation. Shown is the reconciliation: its state, and the shell query for projects past their termination date.

![Root Admin](docs/img/08-root-admin.webp)

### DNS Zones

**Zone Management** — everything policy entitles this user to. A zone that has not been created yet offers *Activate*; an existing one can be opened, shared or extended by a subzone.

![Zone Management](docs/img/09-dns-zones.webp)

**Subzones** — where a rule permits it, a zone can be split further. The subzone becomes a delegated zone of its own, with its own key, and appears indented under its parent.

![Creating a subzone](docs/img/10-subzones.webp)

**Records** — the records of an active zone, edited inline. Changes go straight into the authoritative nameserver.

![DNS records of an active zone](docs/img/11-zone-records.webp)

**Keys** — the TSIG keys of this zone: shared secrets that authenticate changes to it, and to nothing else. They can be rotated, which reissues them for every owner.

![TSIG keys](docs/img/12-zone-keys.webp)

**Dynamic DNS** — ready-made `nsupdate` and `ddclient` configuration for keeping a host's address current, pre-filled with this zone's nameserver and key.

![Dynamic DNS configuration](docs/img/13-zone-dyndns.webp)

**TLS certificates** — the same key issues certificates over DNS-01, wildcards included. The page hands out working snippets for certbot, acme.sh and cert-manager.

![TLS certificate configuration](docs/img/14-zone-tls.webp)

<sub>Screenshots are taken against the development stack with example data. Key material shown in the DNS tabs is redacted, and the reconciliation figures on the Root Admin page are an example, since the development stack has no OpenStack behind it.</sub>

## How it fits together

This is a static single-page application. It holds no business logic and no database of its own: every rule about who may request, approve or delegate anything lives in the APIs behind it, and this app renders their answers.

```
      browser
         │  (1) HTML/JS, config.js and /api/..., all same-origin
         ▼
   ┌───────────────┐
   │ oauth2-proxy  │  (2) injects the Bearer server-side
   │  (BFF)        │
   └───────┬───────┘
           ▼
   ┌──────────────────┐
   │ this app (Caddy) │  serves the static files,
   │                  │  forwards /api/*
   └───────┬──────────┘
           │
           ├──────────────▶ openstack-management-api ──▶ OpenStack
           │                 budgets, projects,          (Keystone, Nova,
           │                 approvals, reconciler        Cinder, Neutron)
           │                        │
           │                        └──▶ role-provider-service
           │                              group membership
           │
           ├──────────────▶ dynamic-zones-api ────────▶ PowerDNS
           │                 zones, records, policy      (authoritative DNS)
           │
           └──────────────▶ llm-management-api (optional; in a cluster
                             access rules, keys, fleet    of its own, over TLS)
```

- **[openstack-management-api](https://github.com/pfisterer/openstack-management-api)**
  owns the budget tree and the project lifecycle. Everything under *Cloud
  Projects* is its state: which budgets you manage, what a request would cost the
  funding budget, who may approve it — and it is what turns an approved project
  into a real OpenStack project.
- **[dynamic-zones](https://github.com/pfisterer/dynamic-zones)** owns zones,
  records, TSIG keys and DNS policy. Everything under *DNS Zones* is its state.
- **llm-management-api** owns the language-model service: who may use it (access rules), API keys for the model endpoint, quotas and the machines serving the models. Everything under *Language Models* is its state. It runs outside this cluster, so Caddy reaches it over TLS, by an address and a host name configured separately.
- **[role-provider-service](https://github.com/pfisterer/role-provider-service)** answers which groups a person belongs to. This app never calls it directly — it reaches it through the projects API, which is where group search in the "Managed by" and "Who can request here" fields comes from.

Whether the *Cloud Projects* section exists at all depends on configuration: with no `CLOUD_RESOURCES_BASE_URL` set, the section and its routes are not registered, and the app is a pure DNS self-service. Which sections exist is decided in one place, [`web/features.js`](web/features.js), from the configured URLs rather than from failed requests — a restarting backend must not look like a section that was never installed. The same goes for *Language Models* and `LLM_BASE_URL`; beyond that, the LLM service itself decides who sees the section. *API Tokens* offers a tab only for an API that is configured (the LLM service is not one of them), and the MCP details only where an MCP URL is set.

Two consequences of this split are worth knowing before changing anything:

- **No token lives in the browser.** In production an `oauth2-proxy` sits in
  front of the app (Backend-for-Frontend): it authenticates the user, keeps the
  session in a cookie and injects the bearer token into API calls server-side.
  The app reads the user's identity from `/oauth2/userinfo`, nothing more. A
  `401` from an API therefore means "the proxy session expired", and the app says
  so instead of navigating away silently.
- **The API clients are build-time dependencies.** Each API publishes its generated TypeScript SDK to npm (`@dhbw-cloud/dynamic-zones-client`, `@dhbw-cloud/os-mgt-client`, `@dhbw-cloud/llm-client`) and this app depends on a version, importing each operation by name. They used to be fetched from the APIs at startup, which meant a missing operation showed up as a silent no-op in the browser; now it fails the build here.

The navigation is data, defined once in [`web/nav.jsx`](web/nav.jsx): which
sections exist, which entries a given user gets, which of them the URL is in. The
header renders it twice (two bars on a wide screen, one list in the burger) and
the shell derives its height from it. Entries with nothing behind them for the
current user are left out rather than shown leading to an empty page.

Server state lives in a query cache (TanStack Query), never in `useState` — see
the reasoning in [`web/providers/query.jsx`](web/providers/query.jsx).

## Running it locally

**Prerequisites:** Node.js 22+ (the render tests' jsdom needs it), npm. For anything beyond the shell of the app you also need the two APIs; the deployment repo ships a script that starts all of them together (`run-development.sh`).

```bash
npm install
npm run dev        # Vite dev server on http://localhost:8084
```

Configuration comes from `.env` (and `.env.local`, which takes precedence — mind
that when ports do not match what your APIs actually serve):

```ini
DYNAMIC_ZONE_BASE_URL=http://localhost:8082/
CLOUD_RESOURCES_BASE_URL=http://localhost:8083/
DUMMY_AUTH=true
OIDC_CLIENT_ID=dev
OIDC_ISSUER_URL=https://sso.example/realms/x
# optional
CLOUD_RESOURCES_MCP_URL=
DYNAMIC_ZONE_MCP_URL=
ACME_SERVER=
LLM_BASE_URL=
LLM_DEV_UPSTREAM=
```

Mind the naming: the dev server reads `DYNAMIC_ZONE_*`, the container reads `DYN_ZONES_*` (see [Deployment](#deployment)); every other variable has the same name in both.

The LLM API answers no cross-origin requests, so it has to be reached same-origin: with `LLM_DEV_UPSTREAM` naming a local llm-management-api, the dev server proxies `/api/llm/` to it, and `LLM_BASE_URL` then points at that path on the dev server (`http://localhost:8084/api/llm/`). `LLM_DEV_UPSTREAM` exists only in the dev server.

`DUMMY_AUTH=true` **plus a dev build** enables the dev login, where you sign in
as any address (`?dev_user=<email>` works too) and the APIs accept that identity
via an `X-Dummy-Auth-User` header. It is compiled out of every `vite build`
artifact — `import.meta.env.DEV` is false there, so no runtime configuration can
re-enable the bypass in a staging or production image.

Vite writes `web/config.js` from those variables on start; in a container the
same file is generated by [`docker-entrypoint.sh`](docker-entrypoint.sh).

```bash
npm run build       # production bundle into dist/
npm run check       # ESLint + all tests — what CI runs (also: make check)
npm test            # tests only
make docker-build   # container image
make bump V=x.y.z   # runs the checks, then sets the version in package.json and Chart.yaml
```

There are two kinds of tests. `*.test.js` cover the pure functions — the arithmetic and string rules that go wrong silently — and run in Node without a DOM. `*.test.jsx` render the main views in jsdom and exist because views that could not render at all have shipped with lint, tests and build all green. CI runs these checks in a workflow of their own; nothing is verified inside the image build.

`package.json` is the single source of truth for the version, and `helm-chart/Chart.yaml` has to agree with it: CI fails on a mismatch rather than fixing it up. `make bump` keeps both in step (it needs `jq` and `helm`).

## Deployment

**Normally deployed as part of [cloud-self-service](https://github.com/pfisterer/cloud-self-service)**, the umbrella chart that composes this service with the other three and pins it by version — and a pinned chart version pins its `appVersion`, which pins the image tag. Installing this chart on its own works, but then nothing keeps it in step with the services it talks to.

The image serves `dist/` through Caddy and generates `config.js` at container
start, so one image works in every environment. Required and optional variables:

| Variable | Required | Meaning |
|---|---|---|
| `DYN_ZONES_BASE_URL` | yes | Base URL of dynamic-zones-api, with trailing slash |
| `CLOUD_RESOURCES_BASE_URL` | no | Base URL of openstack-management-api; empty hides the Cloud Projects section entirely |
| `DYN_ZONES_MCP_URL`, `CLOUD_RESOURCES_MCP_URL` | no | Where an MCP client reaches each API, shown on the API Tokens page; empty shows nothing about MCP for that API. Deliberately not derived from the base URLs: those may be BFF paths, which answer a bearer token with a login redirect |
| `OIDC_CLIENT_ID`, `OIDC_ISSUER_URL` | yes | The login itself is done by the proxy in front; the app uses these for sign-out, sending the browser on to the issuer's logout endpoint (Keycloak's `/protocol/openid-connect/logout` path) with this client ID |
| `ACME_SERVER` | no | ACME endpoint advertised in the certificate instructions |
| `DUMMY_AUTH` | no | Ignored by production builds (see above) |
| `LLM_BASE_URL` | no | Base URL of llm-management-api as the browser reaches it (normally this app's `/api/llm/`); empty hides the Language Models section |
| `LLM_UPSTREAM`, `LLM_HOST` | no | Where Caddy forwards `/api/llm/` to: `host:port` of the ingress in front of the LLM service, always over TLS, and the host name to ask it for, which is also checked against its certificate. Two values because the address to connect to and the name to ask for differ there |
| `DYN_ZONES_UPSTREAM`, `CLOUD_RESOURCES_UPSTREAM` | no | In-cluster `host:port` Caddy forwards `/api/dyndns/` and `/api/projects/` to. These are Service names owned by *other* releases; leaving them to the image defaults is how a rename over there once turned every DNS Zones call into a 502 |

In BFF mode the app must be reached **through** the proxy, and `/oauth2/*` must be routed to it — the app calls `/oauth2/userinfo` for the identity, `/oauth2/auth` to notice an expired session, `/oauth2/start` to begin a new one, and `/oauth2/sign_out` to end it.

A Helm chart lives in [`helm-chart/`](helm-chart) (`selfServiceUI`, `auth`, `ingress`, `bff`), with a `values.schema.json` that rejects unknown keys. The LLM variables come from `selfServiceUI.llmBaseUrl`, `llmUpstream` and `llmHost`, and the chart refuses an `llmUpstream` without an `llmHost`. Images are published to `ghcr.io/pfisterer/self-service-ui`; `-test.N` tags are the staging channel, plain semver is production. A version that is already in the registry is never pushed again, so a commit without a version bump cannot change what a running tag contains, and only stable versions get a Git tag and a GitHub release.

**The proxy is part of this chart.** `bff.enabled` deploys an `oauth2-proxy` in
front of the app, with the ingress pointing at it rather than at the app — so
`ingress.enabled` belongs off in that mode, or there would be a second,
unauthenticated route to the same content. It sits here rather than one level up
for one reason: its upstream *is* this chart's Service, and deriving that name
beats writing it out and watching it go stale. Off by default, because an
environment that already runs its own proxy would otherwise end up with two
owners of the same host.

The proxy reads its client ID, client secret and cookie secret from an existing Secret (`bff.existingSecret`, keys `client-id`, `client-secret`, `cookie-secret`); keeping the cookie secret stable across redeploys is what keeps sessions alive. `bff.cookieExpire` (default `8h`) bounds a session, because the oauth2-proxy default is a week and the offline refresh token it holds is not tied to the single sign-on session, so a logout elsewhere does not reach it. For sign-out to reach the issuer, its host belongs in `bff.whitelistDomains`.

The chart is published as an OCI artifact for every new version pushed to `main`, prereleases included:

```sh
helm pull oci://ghcr.io/pfisterer/charts/self-service-ui --version 0.8.26
```

Values for this chart go under its chart name in the umbrella:

```yaml
self-service-ui:
  selfServiceUI:
    ...
```

## Repository layout

```
web/
  index.jsx            app shell, providers, routes
  nav.jsx              the navigation as data (single source)
  features.js          which sections this deployment has (from config.js)
  header.jsx           both navigation levels + account column
  providers/           auth, session, API clients, query cache, modals
  projects/            Cloud Projects: budget tree, cards, dialogs, role switch, API facade
  dyndns/              DNS Zones: zones, records, keys, administration, zone events
  llm/                 Language Models: overview, keys, usage, fleet, access rules
  home/                landing page, one card per service
  tokens/              API Tokens: one tab per issuing API, MCP config snippets
  swagger/             interactive API documentation for both APIs
  helper/              validation, error formatting, code blocks
  test/                render harness for the *.test.jsx view tests
docs/img/              screenshots used in this README
helm-chart/            deployment chart
Caddyfile              static serving + /api/* forwarding
docker-entrypoint.sh   writes config.js at container start
```

## Related projects

- [cloud-self-service](https://github.com/pfisterer/cloud-self-service) — the umbrella chart that composes all four
- [dynamic-zones](https://github.com/pfisterer/dynamic-zones) — the DNS self-service API behind the DNS Zones section
- [openstack-management-api](https://github.com/pfisterer/openstack-management-api) — the projects and quotas API behind Cloud Projects
- [role-provider-service](https://github.com/pfisterer/role-provider-service) — groups and authorization, consumed by openstack-management-api
- llm-management-api — the language-model service behind the Language Models section

## License

See [LICENSE](./LICENSE).
