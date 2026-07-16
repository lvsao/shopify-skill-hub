# Yanwen (YW56) API reference

## Base URLs

- Production order API: `https://open.yw56.com.cn/api/order`
- Test order API: `https://open-fat.yw56.com.cn/api/order`
- Tracking API: `http://api.track.yw56.com.cn/api/tracking`

Use this reference with `scripts/yanwen_shipping.py`. Yanwen order APIs use POST and UTF-8 JSON. Put `user_id`, `method`, `format=json`, millisecond `timestamp`, `version=V1.0`, and `sign` in the query string; send compact JSON as the body. The signature is lowercase MD5 of `apiToken + user_id + compact-data + format + method + timestamp + version + apiToken`. A normal successful response has `success: true` and `code: "0"`.

## Onboarding and connection

For small-parcel services, sign in to Yanwen, choose **小包专线** > **账号管理** > **制单账号管理** > **新增制单账号**, then save the new 制单账号 as `YANWEN_USER_ID` and its key as `YANWEN_API_TOKEN` in a private `yanwen-shipping.env`. Set `YANWEN_API_BASE_URL=https://open.yw56.com.cn/api/order` for production, or `https://open-fat.yw56.com.cn/api/order` for testing. Do not copy keys into payload JSON, source files, or Git.

Run `check` first. A valid signature does not guarantee the account can create shipments: Yanwen can reject writes for a frozen account. Do not retry or substitute another account; ask the merchant to have Yanwen sales/support activate the 制单账号.

## Operations

| Script operation | Yanwen method / route | Key inputs | State |
| --- | --- | --- | --- |
| `countries` | `common.country.getlist` | `{}` | read |
| `warehouses` | `common.warehouse.getlist` | optional `channelId` | read |
| `channels` | `express.channel.getlist` | `{}` | read |
| `order` / `orders` | `express.order.get` / `express.order.getlist` | waybill, or `listNumber` (max 50) | read |
| `label` | `express.order.label.get` | `waybillNumber`, optional `printRemark`; PDF base64 | read |
| `track` | GET track endpoint | 1-30 Yanwen or last-mile numbers; Authorization is the shipping account | read |
| `verify-kr-pccc` | `common.verify.kr.pccc` | Korean receiver name, phone, personal customs code, 5-digit zip | read |
| `quote` | `calc.list` | `cityId`, `countryId`, grams; optional goods type/product type/dimensions/postcode; permission required | read |
| `overseas-handover` | `calc.handoverCode` | `{}` | read |
| `standard-goods` | `common.import_customs.standard_goods.get` | `countryCode`, English goods name | read |
| `create-order` | `express.order.create` | small parcel or overseas last-mile shipment | **write** |
| `cancel-order` | `express.order.cancel` | `waybillNumber`, optional/required `note` by service | **write** |
| `forecast-weight` | `express.order.forecast_import` | waybill, grams, optional dimensions; permission required | **write** |
| `upload-temu-label` | `express.order.customer_label.import` | Yanwen waybill, final-mile number, PDF base64 | **write** |
| `create-customs-parcel` | `s3.express.create` | overseas customs parcel | **write** |
| `create-customs-bag` | `s3.bag.create` | bag, MAWB, carrier, handover, parcel list | **write** |
| `create-customs-mawb` | `s3.mawb.create` | MAWB, ports, transport, ETD/ETA, bags | **write** |
| `create-overseas-manifest` | `express.overseas.manifest.create` | batch, warehouse, arrival date, bags/parcels | **write** |

Yanwen's billed and unbilled-detail interfaces are AES-encrypted carrier-to-merchant push workflows with allowlisted IP requirements, not normal merchant polling calls. Do not expose a receiver endpoint or encryption key through this skill without a separately reviewed integration.

## Small-parcel create-order requirements

Build one JSON object. Required fields are `channelId`, `orderSource`, `orderNumber`, `receiverInfo`, and `parcelInfo`. The receiver requires `name`, `country` (two-letter code or Yanwen country ID), and `address`. Parcel data requires `hasBattery` (1/0), `currency` (USD/EUR/GBP/CNY/AUD/CAD), `totalQuantity`, `totalWeight` in grams, and non-empty `productList`.

Each product needs Chinese and English goods names, destination and export declaration prices (`price`, `priceExport`), quantity, and unit weight in grams. Verify product/channel, country, warehouse, battery classification, declared value, IOSS, tax numbers, pickup point, and any clearance fields before a create request. The response can return `waybillNumber`, customer `orderNumber`, and `yanwenOrderNumber`.

Before a write, show a redacted preview with channel, country, warehouse, weight, product summary, order count, and any missing fields. Never fabricate a delivery address, tax number, IOSS, or product declaration. After user approval and a successful create response, query the waybill and only retrieve a label on request.

## Tracking and status

Track up to 30 Yanwen or final-mile numbers with `GET http://api.track.yw56.com.cn/api/tracking?nums=...` and the shipping account in `Authorization`. Responses can include Yanwen number, final-mile number/carrier, carrier site/contact, checkpoints, and layered status. Key final-mile checkpoints: `LM25` out for delivery, `LM30` ready for pickup, `LM40` delivered, `LM50` failed delivery, `LM90` returned. Package-level state 1 means no result, 2 label created, 3 in transit, 4 delivery in progress, 5 ready for pickup, 6 delivered, 7 tracking ended, 8 delivery failed, 9 exception, and 0 returned.

## Failure handling

`success: false` or a non-`0` code is a failure. Preserve the response message locally but redact identifiers and addresses in chat. For account-frozen, permission, channel, address, tax, clearance, or rate errors, do not retry the write automatically. Resolve the underlying merchant/carrier decision, then prepare a fresh preview.
