# Operating flags

**Flags** page (one per configured `flags` service): every flag with its state in each environment, environment counters, and the tools to change them. Viewers see everything and can evaluate; admins change.

## Numbers at the top

| Card | Meaning |
|---|---|
| Flags (archived below) | `GET /v1/stats` |
| One card per environment | flags enabled there, the environment's version counter (what applications see as the snapshot ETag), evaluation requests since the service started |

## The list

Columns: key with description, kind, one **switch per environment**, tags, last update. A switch flips `enabled` for that environment with a single `PATCH` and shows the small print next to it (`2 rules · 25%`). Archived flags are read-only; use the **Active / Archived** segment, the kind selector, key/description search and the tag box to filter. Filters live in the URL.

## Creating a flag

**Create flag**: key (permanent), kind (boolean, string, number, json), the initial *value when on* and *value when off* used for every environment, optionally *start enabled in every environment* (for settings), description and tags. The console opens the new flag's page.

## The flag page

One panel per environment, side by side on desktop, stacked on phones. Each holds:

- the **switch** (immediate),
- **value when on** / **value when off** editors matching the kind (JSON gets a text area that validates on blur),
- **rollout percentage** as slider plus number,
- **targeting rules**: name (id derived), user ids, emails, attributes (`plan: pro, team`, one attribute per line), the served value; reorder with the arrows, remove with the bin,
- **Save** (one `PATCH` with the whole panel) and **Discard**; **Copy to …** promotes the panel to another environment,
- who last changed it and when, with the state version.

Edits stay local until **Save**, so a half-typed rule never reaches applications. The switch is the exception: it writes immediately, because it is the kill switch.

App bar: **Edit** (description, tags), **Archive** / **Unarchive**, delete (type the key to confirm). The description line has **Reshuffle buckets** (draws new rollout buckets; asks for confirmation).

## Evaluate

The **Evaluate** panel asks the service what this flag returns for a given environment and context (user id, email, `key=value` attributes) and shows the value, the reason (`rule` with the rule id, `in rollout`, `outside rollout`, `disabled`, `default`, `missing`) and the environment version. Use it to answer "why does this user not see the feature" without touching production.

## History

The last 20 changes of the flag: time, action, environment, actor (API key id) and which fields changed. Older entries: `GET /api/services/:id/flags/flags/:key/history?before=<id>`.

## Behind the scenes

| Call | Purpose |
|---|---|
| `GET /api/services/:id/flags/environments`, `…/stats` | environments and counters |
| `GET /api/services/:id/flags/flags?archived&kind&q&tag&limit&cursor` | list |
| `POST /api/services/:id/flags/flags` | create; admin; audited `flags.flag.create` |
| `GET /api/services/:id/flags/flags/:key` | flag with every environment plus the last 20 history rows |
| `PATCH` / `DELETE /api/services/:id/flags/flags/:key` | metadata, archive, reshuffle / delete; admin; audited |
| `PATCH /api/services/:id/flags/flags/:key/envs/:env` | one environment's state; admin; audited `flags.env.update` |
| `POST /api/services/:id/flags/flags/:key/envs/:env/copy` | `{ to }`; admin; audited `flags.env.copy` |
| `POST /api/services/:id/flags/evaluate` | `{ env, context, keys }` with details |

The console's key must be `readwrite` without an environment scope; a scoped key would hide the other environments from every screen.
