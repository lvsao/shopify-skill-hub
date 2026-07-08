# Selofy Skill Hub — Shopify Onboarding Guide

This document is the single source of truth for connecting any Selofy skill to a Shopify store. All skills reference this guide instead of duplicating onboarding instructions.

---

## Critical Global Constraints (Apply to ALL Skills)

### 1. Unified App Name
- **ALL skills must use the exact same app name**: `Selofy Skill Hub`
- Never use skill-specific names like `serp-optimizer`, `alt-text-tool`, etc.
- When creating or updating the TOML config, always set `name = "Selofy Skill Hub"`
- This ensures all skills share one Dev Dashboard app instead of creating multiple apps.
- **Path C (public_storefront) does not use an app name or TOML** — skip this constraint.

### 2. Scopes Are Additive Only — Never Remove
- **Scopes can only be added, never removed.**
- Before setting scopes in the TOML or deploying, check what scopes are already configured:
  - **Local check**: Read existing `skill-hub.env` or any cached TOML to see previously used scopes.
  - **Remote check**: If possible, query the Dev Dashboard app's current scopes via CLI or API.
- **Merge strategy**: Take the union of existing scopes + new skill's required scopes.
- Example: If existing app has `read_products` and new skill needs `read_products,write_products,read_files`, the final scopes should be `read_products,write_products,read_files` (not just the new skill's scopes).
- When in doubt, use the broadest safe set: `read_products,write_products,read_files,write_files,read_themes,write_themes`
- **Path C (public_storefront) does not use scopes** — skip all scope merging for this path.

### 3. Script Path Resolution — Use Absolute Paths
- **Always use the absolute path to skill scripts.** Never use relative paths like `skills/<skill-name>/scripts/...`.
- **Correct pattern**: `node <absolute-path-to-skill>/scripts/<script-name>.mjs <command> --env skill-hub.env`
- **How to find the absolute path**:
  - On Windows: `C:\Users\<username>\.agents\skills\<skill-name>\scripts\<script-name>.mjs`
  - On macOS/Linux: `~/.agents/skills/<skill-name>/scripts/<script-name>.mjs`
  - Use the agent's skill installation directory, NOT the current working directory.
- **One-line rule**: Replace `skills/<skill-name>/scripts/` with the full absolute path from the agent's skill registry.

### 4. TOML File Creation — Avoid Double-Quoting in PowerShell
- **When creating TOML files in PowerShell, do NOT use here-strings (`@" ... "@`) with double quotes inside.** PowerShell here-strings will escape inner quotes as `""value""`, which breaks TOML parsing.
- **Correct approach for PowerShell**: Use `Set-Content` with single-quoted strings or escape quotes properly:
  ```powershell
  $tomlContent = @"
client_id = "`"$clientId`""
name = "Selofy Skill Hub"
application_url = "https://localhost"
embedded = true

[access_scopes]
scopes = "`"$scopes`""

[webhooks]
api_version = "2026-04"

[auth]
redirect_urls = [
  "https://localhost"
]
"@
  Set-Content -Path "$env:TEMP\shopify-skill-config\shopify.app.toml" -Value $tomlContent
  ```
- **Better approach**: Use a template file or write the TOML using a script that handles escaping correctly.
- **Quick fix**: If you see `""value""` in the TOML, replace all `""` with `"` before running `shopify app config validate`.

---

## How This Guide Works

1. **Agent reads this guide** when `skill-hub.env` is missing, incomplete, or the user requests setup.
2. **Agent asks one A/B/C question** to determine the access method.
3. **Agent creates `skill-hub.env`** with placeholder values for the chosen path.
4. **Agent guides the user** to fill only the required fields.
5. **Agent runs the connection check** and executes the CLI runbook silently.
6. **Agent proceeds** to the skill's main workflow once connected.

### After Skill Updates — Force Reload
When the user runs a skill update command (e.g., `skills update` or similar), the agent **MUST** immediately re-read this onboarding guide and all skill `SKILL.md` files before proceeding. Do not use cached or stale skill instructions. Always fetch the latest version from the skill registry.

For Path C (public_storefront), also re-read `references/public-data-extraction.md` before extracting product data.

---

## Step 0: Environment Preflight

Before asking any setup question:

1. Identify the current working directory from the active terminal or host environment.
2. Look for the exact filename `skill-hub.env` in that directory. Use a direct file check, directory listing, or direct file-read tool. Do not rely on a broad search or glob as the only evidence.
3. Read only variable names and whether required values are present. Never print secrets.
4. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `admin_custom_app` and the store domain plus Admin API token are present, run the skill's `connection-check`.
5. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `dev_dashboard_app` and the store domain plus Client ID plus App Automation Token are present, run the skill's `connection-check`.
6. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `public_storefront` and the store domain is present, run the skill's `connection-check` (tests public JSON endpoint accessibility). No tokens required.
7. If the check succeeds, continue directly to the skill's main workflow. Do not ask where the app was created.
7. If the user says "already configured", "B is configured", "C is configured", or similar, inspect the env instead of asking the A/B/C question again.

Ask the setup question only when `skill-hub.env` is missing, incomplete, placeholder-only, or the access method cannot be determined.

---

## Step 1: Choose Access Method

Ask the user exactly once:

```text
How do you want to connect to the store?

A - Shopify Admin API token (from store Settings → custom app)
B - Dev Dashboard app (Shopify CLI + automation token)
C - Public product URL only (no API needed, read-only preview)
```

Then create or update one private shared file in the current working directory:

```text
skill-hub.env
```

Immediately ensure `.gitignore` contains `skill-hub.env`. Do not ask the user to create the env file or update `.gitignore` manually.

---

## Path A: Shopify Store Settings Custom App (Legacy Custom App)

### What the user needs to provide

Use the skill's `init-env` script to create the env file:

```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method admin_custom_app --env skill-hub.env
```

Ask the user to fill only two things:

**1. Your store address** — choose one:
- Option A (recommended): Copy your Shopify admin URL from your browser — it looks like `https://admin.shopify.com/store/your-store-name`
- Option B: Your website address (must not be password-protected) — for example `www.your-store.com`

**2. Your Admin API access token** — created in your Shopify admin:
- Go to **Settings** → **Apps and sales channels** → **Develop apps**
- Choose your app (or create one)
- Click **Admin API access token** → **Install app** → copy the token

### Recommended scopes

```text
read_products,write_products,read_files,write_files
```

If the merchant only needs SEO title and meta description (no alt text), `read_products,write_products` is enough. Add file scopes only when image alt text updates are in scope.

### Connection verification

After the user fills the env file, run:

```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs connection-check --env skill-hub.env
```

If it succeeds, proceed to the skill's main workflow.

---

## Path B: Dev Dashboard App (Recommended for AI Agent Workflows)

This path uses **Shopify CLI + App Automation Token** for a fully non-interactive setup after the single store authorization step.

### What the user needs to provide

Use the skill's `init-env` script to create the env file:

```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method dev_dashboard_app --env skill-hub.env
```

Ask the user to fill only three things:

**1. Your store address** — choose one:
- Option A (recommended): Copy your Shopify admin URL from your browser — it looks like `https://admin.shopify.com/store/your-store-name`
- Option B: Your website address (must not be password-protected) — for example `www.your-store.com`

**2. Your app Client ID** — found in your Dev Dashboard:
- Go to [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)
- Click **Apps** and select your app
- Click **Settings**
- Copy the **Client ID** (a 32-character hex string, e.g., `YOUR_CLIENT_ID`)

**3. Your App Automation Token** — generated in your Dev Dashboard:
- Go to [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)
- Click **Apps** and select your app
- Click **Settings**
- Scroll down to the **App Automation Token** section
- Click **Generate token**
- Copy the token — it **must start with `atkn_`** (e.g., `atkn_abc123...`)

> **Token Type Warning — Read Carefully:**
> - ✅ **App Automation Token** = starts with `atkn_` — this is what you need for this workflow
> - ❌ **API Secret Key** = starts with `shpss_` — this is NOT an automation token
> - ❌ **Admin API Access Token** = starts with `shpat_` — this is for Path A only
> - ❌ **Storefront Access Token** = starts with `shpat_` — this is for storefront access only
>
> If you see a token starting with `shpss_`, you are looking at the API Secret Key, NOT the App Automation Token. Go back to Dev Dashboard → App → Settings and find the **App Automation Token** section specifically.

### Domain Resolution (MANDATORY — Do Not Skip)

**Before running any CLI commands, the agent MUST resolve the user's store address to a `.myshopify.com` domain.** Never guess or assume the domain.

Use this priority order:

**Method 1: Admin URL extraction (fastest, most reliable)**
- If the user provides `https://admin.shopify.com/store/<name>` → extract `<name>` → `<name>.myshopify.com`
- Also handle `https://admin.shopify.com/store/<name>/products` etc. — just extract the store name segment after `/store/`

**Method 2: Direct `.myshopify.com` input**
- If the user already provides something ending in `.myshopify.com` → use directly

**Method 3: Fallback request (when store domain cannot be extracted)**
- If the store domain cannot be extracted from Method 1 or 2, ask the user: "Please provide your official .myshopify.com store domain (e.g., your-store.myshopify.com) or copy your Shopify admin URL (e.g. `https://admin.shopify.com/store/your-store-name`) to proceed."

After resolving, update `skill-hub.env` with the resolved `SKILL_HUB_SHOPIFY_STORE_DOMAIN=<name>.myshopify.com` before running any CLI commands.

### CLI Runbook (Silent, Non-Blocking)

Run this sequence silently. The agent executes all commands — do not ask the user to run them.

**Prerequisite check:**
```text
node -v
npm -v
shopify version
```
If Shopify CLI is missing or too old (no `shopify store` command), install it:
```text
npm install -g @shopify/cli@latest
```

**Step 1 — Create app config TOML (non-interactive):**
Create a temporary folder under the operating-system temp directory. Create `shopify.app.toml` with this exact content:

```toml
# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration
client_id = "<CLIENT_ID>"
name = "Selofy Skill Hub"
application_url = "https://localhost"
embedded = true

[access_scopes]
scopes = "<MERGED_SCOPES>"

[webhooks]
api_version = "2026-04"

[auth]
redirect_urls = [
  "https://localhost"
]
```

**Important scope merging rules:**
- Replace `<CLIENT_ID>` with the user's Client ID.
- Replace `<MERGED_SCOPES>` with the **union** of existing app scopes + this skill's required scopes.
- **Never remove existing scopes.** Only add new ones.
- If you cannot determine existing scopes, use the broadest safe set: `read_products,write_products,read_files,write_files`
- App name must always be `Selofy Skill Hub` — never use skill-specific names.

**PowerShell TOML creation (correct escaping):**
```powershell
$clientId = "<CLIENT_ID>"
$scopes = "<MERGED_SCOPES>"
$tomlContent = @"
client_id = "$clientId"
name = "Selofy Skill Hub"
application_url = "https://localhost"
embedded = true

[access_scopes]
scopes = "$scopes"

[webhooks]
api_version = "2026-04"

[auth]
redirect_urls = [
  "https://localhost"
]
"@
New-Item -ItemType Directory -Force -Path "$env:TEMP\shopify-skill-config" | Out-Null
Set-Content -Path "$env:TEMP\shopify-skill-config\shopify.app.toml" -Value $tomlContent -Encoding UTF8
```

**Verify TOML has single quotes, not double-double quotes:**
- ✅ Correct: `client_id = "YOUR_CLIENT_ID"`
- ❌ Wrong: `client_id = ""YOUR_CLIENT_ID""`
- If you see `""`, fix before running validate.

**Step 2 — Validate config (non-interactive, uses automation token):**
Set the automation token as an environment variable, then run validate.

**PowerShell syntax:**
```powershell
$env:SHOPIFY_APP_AUTOMATION_TOKEN = "<token>"
shopify app config validate --path <temp-dir> --no-color
```

**Bash/zsh syntax:**
```bash
export SHOPIFY_APP_AUTOMATION_TOKEN="<token>"
shopify app config validate --path <temp-dir> --no-color
```

**Important:** Do NOT use `set VAR=value && command` syntax — this does not reliably pass the environment variable to child processes in PowerShell. Use `$env:VAR="value"` (PowerShell) or `export VAR="value"` (bash) instead.

This command uses `SHOPIFY_APP_AUTOMATION_TOKEN` and returns immediately without any interactive prompt.

**Step 3 — Deploy scopes to Dev Dashboard (non-interactive, uses automation token):**
```text
shopify app deploy --client-id <client-id> --path <temp-dir> --allow-updates --no-color
```
The automation token is already set in the environment from Step 2. This command returns immediately and updates the app's access scopes in the Dev Dashboard.

**Scope deployment rules:**
- This command will **add** scopes to the app. It will NOT remove existing scopes.
- If the app already has scopes from previous skill setups, they remain intact.
- The TOML `<MERGED_SCOPES>` should include all scopes needed across all installed skills.

**Step 4 — Store authorization (the ONLY interactive step):**
Before running this command, tell the user:
> "Next, a Shopify permission authorization page will open in your browser. Please review the scopes and click **Authorize**."

```text
shopify store auth --store <resolved-domain>.myshopify.com --scopes <scopes> --json --no-color
```
This command opens the browser for the user to approve permissions. The agent should set a generous timeout (180+ seconds) and wait for the user to complete authorization. The JSON output confirms success with the store domain, user ID, scopes, and token expiration.

**Step 5 — Verify connection:**
```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs connection-check --env skill-hub.env
```
If it reports `CLI_AUTH_REQUIRED`, rerun `shopify store auth` and ensure the user clicked Authorize in the browser.

**Step 6 — Clean up:**
Delete the temporary folder using the current terminal's native recursive delete command.

### Why This Path Is Better

| Aspect | Old Approach (`config link`) | New Approach (Automation Token) |
|--------|------------------------------|--------------------------------|
| Partners auth | Interactive device code flow, blocks CLI | Non-interactive, uses `SHOPIFY_APP_AUTOMATION_TOKEN` |
| `config validate` | Triggers interactive auth | Returns immediately |
| `app deploy` | Triggers interactive auth | Returns immediately |
| User interaction | Multiple browser prompts, timeout loops | Single store authorization only |
| Reliability | Prone to device code expiry loops | Deterministic, CI/CD-tested |

### Critical CLI Notes

- **Unified app name**: All skills share one app named `Selofy Skill Hub`. Never create skill-specific apps.
- **Scopes are additive**: Never remove scopes. Merge existing + new scopes. Check `skill-hub.env` or query app for current scopes before deploying.
- **Script paths**: Always use absolute paths to skill scripts (e.g., `C:\Users\<user>\.agents\skills\<skill>\scripts\...`), never relative `skills/...` paths.
- **TOML quoting**: In PowerShell, avoid `""value""` double-double-quoting. Use proper escaping or verify TOML has single `"` quotes before validate.
- **Token format validation**: App Automation Tokens **must start with `atkn_`**. If the token starts with `shpss_`, `shpat_`, `shpca_`, or any other prefix, it is NOT an App Automation Token. Reject invalid tokens and ask the user to generate the correct one from Dev Dashboard → App → Settings → App Automation Token.
- **`SHOPIFY_APP_AUTOMATION_TOKEN`** must be set as an environment variable before running any `shopify app` commands. The agent should set it from `skill-hub.env` before executing CLI commands.
- **Environment variable syntax**: Use `$env:VAR="value"` in PowerShell or `export VAR="value"` in bash. Do NOT use `set VAR=value && command` — this does not reliably pass the variable to child processes in PowerShell.
- **`--no-color`** disables color output but does NOT disable interactive prompts. The automation token is what makes commands non-interactive.
- **`shopify app config link`** should be **avoided** in this workflow. It triggers interactive Partners auth even with `--no-color`. Manually creating the TOML file is faster and more reliable.
- **`shopify store list`** and **`shopify auth status`** are NOT valid diagnostics for this no-connector store-auth workflow. Do not use them.
- All temporary files (TOML, query files, output files) must live in the operating-system temp directory and be deleted in a `finally` block.

---

## Path C: Public Storefront URL (No API Needed)

This path is for merchants who want a read-only SEO audit without granting any Shopify API permissions. The skill will fetch all available product data from Shopify's built-in public JSON endpoints and HTML scraping.

### What the user needs to provide

Just one product URL or store domain — no tokens, no app creation, no scopes.

**1. A product URL or store address** — choose one:
- Option A (most useful): A product page URL like `https://www.your-store.com/products/product-name`
- Option B: A store domain like `www.your-store.com` or `your-store.myshopify.com`

### Env file setup

Create `skill-hub.env` with the store domain:

```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method public_storefront --env skill-hub.env
```

Or create it manually:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=public_storefront
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

### Connection verification

Test that the store's public JSON endpoints are accessible:

```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs connection-check --env skill-hub.env
```

If the check succeeds, the store is accessible. If it fails, the store may use bot protection (Cloudflare, Akamai, etc.) — suggest Path A or Path B instead.

### What this path can do (read-only)

| Feature | Available | Notes |
|---------|-----------|-------|
| Read product title, description, vendor, type, tags | ✅ | From `/products/{handle}.json` |
| Read variants, prices, SKUs, inventory | ✅ | Full variant data in JSON |
| Read all product images with alt text | ✅ | CDN URLs are publicly downloadable |
| Generate alt text via vision (download + analyze) | ✅ | CDN is public, no auth needed |
| Read effective SEO title and meta description | ✅ | From `<title>` and `<meta>` tags in page HTML |
| Score product metadata and suggest improvements | ✅ | Effective values are available |
| Generate full HTML audit report | ✅ | All above fields support scoring |
| Read product description (`descriptionHtml`) | ✅ | `body_html` in JSON = Admin API `descriptionHtml` |
| Scan multiple products via storefront | ✅ | `/products.json` pagination |
| Narrow by collection | ✅ | `/collections.json` + `/collections/{handle}/products.json` |

### What this path CANNOT do

| Feature | Reason |
|---------|--------|
| Distinguish custom SEO fields from Shopify fallbacks | HTML `<title>` and `<meta>` always show the effective (resolved) value — we cannot see if `seo.title` is explicitly set or empty. Mark as "effective" rather than "custom" or "fallback". |
| Read or audit metafields | Not exposed in any public endpoint |
| Read metafieldDefinitions | Not exposed in any public endpoint |
| Read collection memberships | Not in public product JSON |
| Read onlineStoreUrl | Not in public JSON (can construct from domain + handle) |
| Determine product status (active/archived/draft) | Not in public JSON (assume active if published_at is set) |
| Write any changes | Read-only by nature |
| Access stores behind Cloudflare/Akamai | Public endpoints may be blocked; advise Path A or B |

### Data source priority

When reading a product in Path C, use this priority:

1. **`/products/{handle}.json`** — best source for title, description, variants, images, prices, SKUs, vendor, type, tags, options, timestamps
2. **Product page HTML** — `<title>` and `<meta name="description">` for effective SEO fields
3. **`/products.json`** — for scanning all products (paginated, lacks `body_html`)

### How to extract the product handle from a URL

The user may provide a full URL like:

```text
https://www.your-store.com/collections/dog-harnesses/products/flora-dog-walking-set
```

Extract the handle by taking the path segment immediately after `/products/`:

```text
/products/<handle>.json
/flora-dog-walking-set.json (wrong — include the full products path)
```

The handle is `flora-dog-walking-set`. Fetch:

```text
https://www.your-store.com/products/flora-dog-walking-set.json
```

### How to resolve store domain

Same methods as Path B:

- Admin URL: `admin.shopify.com/store/<name>` → `<name>.myshopify.com`
- Direct: `your-store.myshopify.com` → use directly
- Website: `www.your-store.com` → fetch HTML and extract `Shopify.shop` variable
- Extract from product URL: `https://www.your-store.com/products/...` → domain is `www.your-store.com`, then resolve via HTML

### After connecting

After the connection check succeeds, read `references/public-data-extraction.md` for detailed guidance on extracting each field type from public sources.

---

## Common Error Classes

When CLI commands fail, agents must report the exact failure class:

| Error Class | Meaning | Action |
|-------------|---------|--------|
| `CLI_NOT_FOUND` | Shopify CLI not installed | Run `npm install -g @shopify/cli@latest` |
| `CLI_SPAWN_FAILED` | CLI process failed to start | Check Node.js version, reinstall CLI |
| `CLI_AUTH_REQUIRED` | Store authorization missing or expired | Rerun `shopify store auth` |
| `CLI_ACCESS_DENIED` | Token or scopes insufficient | Verify App Automation Token, check scopes in Dev Dashboard |
| `CLI_OUTPUT_MISSING` | Command returned no output | Check command flags, increase timeout |
| `CLI_JSON_PARSE_FAILED` | Output is not valid JSON | Check `--json` flag, inspect raw output |
| `CLI_GRAPHQL_ERRORS` | GraphQL query/mutation errors | Check query syntax, verify scopes |

Do not collapse all failures into a generic "auth problem" message.

---

## Helper Script Requirements

Skills that implement this onboarding must provide a helper script with at least these commands:

```text
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method admin_custom_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method admin_custom_app --env skill-hub.env --scopes "read_products,write_products"
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method dev_dashboard_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/<skill-script>.mjs init-env --method public_storefront --env skill-hub.env
node <absolute-path-to-skill>/scripts/<skill-script>.mjs connection-check --env skill-hub.env
```

The `connection-check` command must:
1. Read `skill-hub.env` to determine the access method.
2. For `admin_custom_app`: make a read-only GraphQL probe to the Admin API using the token.
3. For `dev_dashboard_app`: run `shopify store execute` with a minimal query (e.g., `{ shop { name } }`) and parse the output file.
4. For `public_storefront`: fetch `https://<domain>/products.json?limit=1` and verify the response is valid JSON with a `products` array. If the store returns a 403 or blocks the request, suggest Path A or B.
5. Return a structured result indicating success, `CLI_AUTH_REQUIRED`, or a specific error class.
6. Never print tokens or secrets.

---

## Env File Template

The `skill-hub.env` file should contain these variables:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=
SKILL_HUB_SHOPIFY_CLIENT_ID=
SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN=
```

For Path A (admin_custom_app), replace the last two lines with:
```text
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=
```

For Path C (public_storefront), nothing needs to be filled beyond the store domain:
```text
SKILL_HUB_SHOPIFY_ACCESS_METHOD=public_storefront
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

The agent should create this file with placeholder values and ask the user to fill only the required fields for their chosen path.
