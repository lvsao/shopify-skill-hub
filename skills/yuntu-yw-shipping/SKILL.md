---
name: "yuntu-yw-shipping"
slug: "yuntu-yw-shipping"
displayName: "云途物流 & 燕文物流 Shipping"
description: "YunExpress（云途物流）与 Yanwen（燕文物流）的跨境物流查单、报价和制单工具。Use when an ecommerce seller asks to track a YunExpress or Yanwen package, check where a parcel is, look up a waybill/order, shipping channel, warehouse, delivery method, route, price or billable weight, or prepare a shipping order, label, cancellation, or other carrier request for Shopify, Amazon, TikTok Shop, Temu, an independent store, or another ecommerce order. It does not need Shopify login and does not register carrier accounts, automatically dispatch shipments, or write to a carrier without the merchant's credentials, a redacted preview, and explicit approval."
version: 1.0.0
author: "Selofy (lvsao)"
license: MIT
platforms: [macos, linux, windows]
required_environment_variables:
  - name: YUNTU_CUSTOMER_CODE
    prompt: "Provide the YunExpress customer code from API Shipping."
    help: "Store it only in a private local yunexpress-shipping.env file."
    required_for: "All authenticated YunExpress OMS API calls."
  - name: YUNTU_API_SECRET
    prompt: "Provide the YunExpress API secret from API Shipping."
    help: "Store it only in a private local yunexpress-shipping.env file."
    required_for: "All authenticated YunExpress OMS API calls."
  - name: YUNTU_OMS_BASE_URL
    prompt: "Provide the OMS base URL for the intended environment."
    help: "Use the production or UAT URL provided by YunExpress; do not guess or mix credentials between them."
    required_for: "All authenticated YunExpress OMS API calls."
  - name: YANWEN_USER_ID
    prompt: "Provide the Yanwen shipping-account number from 制单账号管理."
    help: "Store it only in a private local yanwen-shipping.env file."
    required_for: "All authenticated Yanwen small-parcel, tracking, and rate API calls."
  - name: YANWEN_API_TOKEN
    prompt: "Provide the Yanwen secret for the shipping account."
    help: "Store it only in a private local yanwen-shipping.env file."
    required_for: "All authenticated Yanwen small-parcel, tracking, and rate API calls."
  - name: YANWEN_API_BASE_URL
    prompt: "Provide the Yanwen production or test order API base URL."
    help: "Use only the matching URL supplied by Yanwen for the selected environment."
    required_for: "All authenticated Yanwen order API calls."
metadata:
  openclaw:
    requires:
      env: [YUNTU_CUSTOMER_CODE, YUNTU_API_SECRET, YUNTU_OMS_BASE_URL, YANWEN_USER_ID, YANWEN_API_TOKEN, YANWEN_API_BASE_URL]
      bins: [python]
    envVars:
      YUNTU_CUSTOMER_CODE:
        required: true
        description: "Private YunExpress API customer code."
      YUNTU_API_SECRET:
        required: true
        description: "Private YunExpress API secret."
      YUNTU_OMS_BASE_URL:
        required: true
        description: "YunExpress OMS production or UAT base URL."
      YANWEN_USER_ID:
        required: true
        description: "Private Yanwen shipping-account number."
      YANWEN_API_TOKEN:
        required: true
        description: "Private Yanwen shipping-account API secret."
      YANWEN_API_BASE_URL:
        required: true
        description: "Yanwen order API production or test base URL."
    primaryEnv: YUNTU_CUSTOMER_CODE
    emoji: "📦"
    homepage: "https://github.com/lvsao/shopify-skill-hub"
  hermes:
    tags: [YunExpress, Yanwen, Shipping]
    related_skills: []
---

# 云途物流 & 燕文物流 Shipping

## Scope and boundaries

- Do not request Shopify login or use Shopify APIs. This skill operates only against YunExpress and Yanwen APIs.
- Use it for carrier-side work only: checking parcels, orders, channels, warehouses, rates, charges, tracking, labels, and preparing carrier orders. Do not use it to register carrier accounts, manage a Shopify store, fulfill orders automatically, or make customs/address decisions for the merchant.
- Treat carrier account codes and API secrets as secrets. Put each only in a private, ignored `yunexpress-shipping.env` or `yanwen-shipping.env` in the user's working directory; never paste them into chat, source files, command history, reports, or Git.
- The supplied OMS specification includes a UAT address and test account. A test credential may return real, accurate quotation results, but it is not a substitute for the merchant's own credentials and must never be embedded, disclosed, or used for creating operational shipments.
- Read operations may run after a connection check. Any operation that creates, changes, cancels, deletes, intercepts, registers/disables IOSS, changes subscriptions, or submits CPSC data needs an explicit user approval immediately before `--execute`.
- Do not call user registration; direct account creation, frozen-account, product-permission, and billing issues to the relevant carrier.

## Onboarding

### YunExpress

Ask the merchant to obtain their own credentials:

1. Sign in to YunExpress.
2. Select **专线** (or **B2B**) in the left navigation.
3. Open **API寄件**, then select **API**.
4. Copy **客户代码** and **API密钥** into their private `yunexpress-shipping.env` using `init-env` below. Ask whether they are using production or UAT, then set the matching OMS base URL supplied by YunExpress.

Run the read-only check before all other work. It validates authentication by loading countries, product methods, goods types, and a quote; it never creates an order.

### Yanwen

Ask the merchant to obtain their own Yanwen **制单账号** and secret:

1. Sign in to the Yanwen customer centre.
2. Select **小包专线**.
3. Open **账号管理**, then **制单账号管理**.
4. Select **新增制单账号** and copy the resulting **制单账号** and **密钥** into private `yanwen-shipping.env` using `yanwen_shipping.py init-env`.

Run `check` before quoting, tracking, or creating a Yanwen order. A Yanwen shipping account can be frozen even when its signature is valid; report the carrier error and direct the merchant to Yanwen sales or support instead of retrying a create request.

## Workflow

1. Identify the requested carrier. Read `references/yunexpress-api.md` for YunExpress or `references/yanwen-api.md` for Yanwen before preparing the selected operation.
2. Create the private env template, fill it locally, then run `check`.
3. For a quote, resolve country and shipping methods if needed, then run `get quote` with dimensions, weight, postal code, package type, and optional services.
4. For tracking or shipment lookup, prefer `get order`, `get tracking`, `get all-tracking`, `get tracking-number`, or `get fee-detail`; use `post carrier` or `post label` with an identifier-array payload when required.
5. For a shipment or another state change, make a JSON payload file in the user's working directory, run the command without `--execute`, and show the redacted request plan and validation findings.
6. Ask for a clear confirmation that names the operation and affected order numbers. Only then repeat with `--execute`.
7. Verify a created or changed waybill with `get order`; verify tracking changes with the relevant subscription listing. Keep the response `RequestId` for support, but redact personal data in summaries.

## Script entry points

```text
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py init-env --env yunexpress-shipping.env
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py check --env yunexpress-shipping.env
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py get countries --env yunexpress-shipping.env
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py get quote --env yunexpress-shipping.env --query CountryCode=GB Weight=0.125 Length=1 Width=1 Height=1 PackageType=0
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py get order --env yunexpress-shipping.env --query OrderNumber=<waybill-or-order-or-tracking-number>
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py post create-order --env yunexpress-shipping.env --input shipment.json
python <absolute-path-to-skill>/scripts/yunexpress_shipping.py post create-order --env yunexpress-shipping.env --input shipment.json --execute
python <absolute-path-to-skill>/scripts/yanwen_shipping.py init-env --env yanwen-shipping.env
python <absolute-path-to-skill>/scripts/yanwen_shipping.py check --env yanwen-shipping.env
python <absolute-path-to-skill>/scripts/yanwen_shipping.py get channels --env yanwen-shipping.env
python <absolute-path-to-skill>/scripts/yanwen_shipping.py get track --env yanwen-shipping.env --numbers <waybill-or-last-mile-number>
python <absolute-path-to-skill>/scripts/yanwen_shipping.py post create-order --env yanwen-shipping.env --input shipment.json
python <absolute-path-to-skill>/scripts/yanwen_shipping.py post create-order --env yanwen-shipping.env --input shipment.json --execute
```

Use `--help` to list all supported operations. `post` prints a redacted preview for a write until `--execute` is present. It sends JSON with UTF-8, derives `Authorization: Basic` from `Base64(customer-code & API-secret)`, and never logs that token.

## Output rules

- Quote results: compare service code/name, total fee, currency, billable weight, tracking availability, goods type, and delivery days; label prices as a point-in-time API result.
- Shipment preview: include order count (maximum 10 per create request), destination, selected product code, weight/dimensions, declared goods, optional services, and validation errors. Do not display full street addresses, phone numbers, emails, or credentials in chat.
- Labels: return the temporary label URL and order-level errors; do not automatically download, print, or share it.
- Explain YunExpress non-`0000` response codes with `references/yunexpress-api.md` and Yanwen non-`0` response codes with `references/yanwen-api.md`; escalate account, product-permission, frozen-account, address, or clearance decisions to the merchant or relevant carrier.
