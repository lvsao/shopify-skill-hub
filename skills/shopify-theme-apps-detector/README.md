# shopify-theme-apps-detector

Scan any public Shopify store and produce a visual HTML report showing the theme and every detectable app — with logos, App Store links, and traceable evidence. Zero API token. Zero login.

## Usage

```
node scripts/store-scanner.mjs https://example.myshopify.com
```

The script outputs a JSON evidence bundle to stdout. Pass the URL to an AI agent running this skill to get a full HTML report.

## What it detects

- **Theme** — name, schema_name, version, Theme Store link (or vendor page for custom themes)
- **Apps** — from script URLs, app block comments, window globals, CSS class namespaces, and data attributes
- **Confidence** — HIGH / MEDIUM / LOW per finding, with raw evidence snippets

## Prerequisites

- Node.js 18+ (native `fetch`)
- Internet access
- No npm install required

## Files

| Path | Purpose |
|------|---------|
| `SKILL.md` | Full skill instructions for AI agents |
| `scripts/store-scanner.mjs` | Zero-dependency evidence collector |
| `assets/report-template.html` | Mandatory HTML report template |
| `references/detection-principles.md` | Signal reference for AI reasoning |
| `agents/openai.yaml` | OpenAI agent interface metadata |
