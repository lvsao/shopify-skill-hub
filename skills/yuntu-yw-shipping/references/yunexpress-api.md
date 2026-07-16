# YunExpress Shipping API reference

Use this reference with `scripts/yunexpress_shipping.py`. OMS 1.4.5 specifies UTF-8 requests and JSON responses. All requests need `Accept: application/json` and `Authorization: Basic <Base64(customer-code & api-secret)>`. A normal envelope contains `Code`, `Message`, `RequestId`, and `TimeStamp`; treat `Code: "0000"` as success and retain `RequestId` for support.

## Configuration and safety

Set these only in a private local env file: `YUNTU_CUSTOMER_CODE`, `YUNTU_API_SECRET`, and `YUNTU_OMS_BASE_URL`. Set `YUNTU_OMS_BASE_URL=http://oms.api.yunexpress.com` for production; the helper appends its `/api/...` route. The API document has a distinct UAT endpoint: use only the UAT base URL supplied by YunExpress with matching UAT credentials. Never commit either env file or a request containing personal data.

The specification documents a test account and UAT endpoint. It may be useful for read-only quotation checks, and a known test credential can return accurate quote pricing. Do not place that credential in this skill, use it to create operational shipments, or assume it has merchant permissions.

## Operations

`get` operations use `--query Key=Value`; `post` operations use `--input payload.json`. Operations marked **write** need a preview and explicit approval before `--execute`.

| Script operation | Method and route | Inputs / result | State |
| --- | --- | --- | --- |
| `countries` | GET `/api/Common/GetCountry` | none; ISO-like two-letter country codes | read |
| `shipping-methods` | GET `/api/Common/GetShippingMethods` | optional `CountryCode`; codes, names, tracking flag | read |
| `goods-types` | GET `/api/Common/GetGoodsType` | none; goods type IDs/names | read |
| `quote` | GET `/api/Freight/GetPriceTrial` | `CountryCode`, `Weight`; optional `Length`, `Width`, `Height`, `PostCode`, `PackageType`, `Origin`, `ExtraServicesList[n].ExtraService` | read |
| `tracking-number` | GET `/api/Waybill/GetTrackingNumber` | `CustomerOrderNumber`, comma-separated; 30-minute cache | read |
| `sender` | GET `/api/WayBill/GetSender` | `OrderNumber` (waybill/order/tracking) | read |
| `order` | GET `/api/WayBill/GetOrder` | `OrderNumber` (waybill/order/tracking) | read |
| `tracking` | GET `/api/Tracking/GetTrackInfo` | `OrderNumber`; follows subscription display settings | read |
| `all-tracking` | GET `/api/Tracking/GetTrackAllInfo` | `OrderNumber`; full track for supported products | read |
| `fee-detail` | GET `/api/Freight/GetShippingFeeDetail` | `WayBillNumber`; charged fees and charge weight | read |
| `create-order` | POST `/api/WayBill/CreateOrder` | array, maximum 10 shipment objects | **write** |
| `update-weight` | POST `/api/WayBill/UpdateWeight` | `OrderNumber`, `Weight`; submitted orders only | **write** |
| `delete-order` | POST `/api/WayBill/Delete` | `OrderType` (1 waybill, 2 customer order, 3 tracking), `OrderNumber`; draft/submitted only | **write** |
| `intercept` | POST `/api/WayBill/Intercept` | `OrderType`, `OrderNumber`, non-empty `Remark`; submitted/received only | **write** |
| `label` | POST `/api/Label/Print` | array of up to 50 waybill/order/tracking identifiers; response has temporary PDF URL | read |
| `carrier` | POST `/api/Waybill/GetCarrier` | array of waybill/order/tracking identifiers | read |
| `register-ioss` | POST `/api/WayBill/RegisterIoss` | IOSS record; return registration code/status | **write** |
| `disable-ioss` | POST `/api/WayBill/DisableIoss` | `code` registration identifier | **write** |
| `self-pickup-point` | POST `/api/common/SelfPickupPoint` | destination/address or lat/lng, product, weight | read |
| `subscribe-order` / `unsubscribe-order` | POST `/api/tracking/CreatedOrderSubscribe` or `CancelOrderSubscribe` | `DisplayMode`, `QueryMode`, `shipper_hawbcode[]` | **write** |
| `list-order-subscriptions` | POST `/api/tracking/GetOrderSubscribe` | `currentpage`, `pagesize`, `StartDate`, `EndDate`, optional identifiers | read |
| `subscribe-product` | POST `/api/tracking/CreatedProductSubscribe` | `display_mode`, `product_info[]`, optional `query_mode`, `country_codes[]` | **write** |
| `unsubscribe-product` | POST `/api/tracking/CancelProductSubscribe` | `Ids[]` from product subscription list | **write** |
| `list-product-subscriptions` | POST `/api/tracking/GetProductSubscribe` | `pageCount`, `pageIndex`, optional `display_mode`, `product_code` | read |
| `submit-cpsc-efiling` | POST `/api/receive/cpscefiling` | U.S. CPSC declaration | **write** |

## Quote and response interpretation

`Weight` is kg to three decimals. Dimensions are whole centimetres and default to 1 if omitted. `PackageType` is 0 general goods, 1 battery (the document's default), or 2 special goods. Optional extra-service codes include `BJFA`, `BJFR`, `BJDR`, `BJFDR`, `Ls0091` (signature), and `EWFZ100001` (custom insured amount).

Each quote can include product `Code`, Chinese/English name, base and registration/fuel/sundry/tariff-prepay/insurance/signature fees, `TotalFee`, `Currency`, `Weight` (billable), `DeliveryDays`, `Track`, `GoodsType`, and `Remark`. Filter results by the merchant's actual goods restrictions rather than choosing the cheapest result automatically.

## Create-order payload

The body is an array of 1-10 objects. Each object needs at least `CustomerOrderNumber`, `ShippingMethodCode`, `Length`, `Width`, `Height`, `PackageCount` (>0), `Weight` (>0), `Receiver`, and non-empty `Parcels`. Verify the chosen shipping method with a quote first.

`Receiver` needs `CountryCode`, `FirstName`, `Street`, and `City`; `LastName`, company, state, zip, phone, email, mobile, and house number can be product/country dependent. `Parcels[]` needs English declaration `EName`, `Quantity`, `UnitPrice` (FOB), `UnitWeight` (kg), and `CurrencyCode`. Add HS code, SKU, sales URL, material/use, manufacturer, FDA, fabric, and CPSC fields only where applicable.

Relevant optional top-level fields include tracking/transaction number, `SizeUnits`, `ApplicationType`, return/insurance/tariff-prepay choices, `SourceCode`, Brazilian/tax/IOSS codes, dangerous-goods type, `Sender`, `OrderExtra`, `ChildOrders` (FBA), `Platform`, `SalePlatformUrl`, `Payment`, and pickup-point code. EU IOSS workflow requires either `IossCode` or an `OrderExtra` using `V1`; VAT prepay similarly uses its number or `V4`. Do not infer tax, insurance, dangerous-goods, FBA, or pickup-point values.

The create response gives an item per customer order: `Success`, `Remark`, `WayBillNumber`, `TrackingNumber`, `TrackType` (1 available, 2 pending, 3 none), `RequireSenderAddress`, `AgentNumber`, remote-area status, and child-box tracking data. Query the order after success; poll `tracking-number` only where tracking is pending.

## Tracking and subscriptions

`tracking` respects the subscribed display mode; use `all-tracking` only for listed supported product channels. Tracking returns package state, `TrackingStatus`, carrier/provider information, POD URL(s), and ordered events with time, place, node code, description, timezone, and abnormal-reason details. Package state: 0 unknown, 1 submitted, 2 in transit, 3 delivered, 4 received, 5 cancelled, 6 delivery failed, 7 returned. Tracking status: 0 not found, 10 pre-advice, 20 transit, 30 ready for pickup, 40 failed, 50 delivered, 60 exception, 80 unknown, 90 returned, 100 cancelled.

For order subscriptions, `DisplayMode` is 0 full, 1 origin, 2 final-mile, 3 hide, 4 electronic pre-advice plus final-mile. `QueryMode` is a bit mask: 1 waybill, 2 customer order, 4 tracking number; combinations are 3, 5, 6, 7. Product subscription writes are account-wide settings; obtain the exact `Ids` from the list before cancelling.

## IOSS, pickup points, and CPSC

IOSS registration is sensitive account data. Require `IossType` (0 individual, 1 platform), `IossNumber` matching two letters plus ten digits, and platform name when type is 1; add supporting documents only when the merchant approves. Save only the returned registration identifier needed for a later disable request.

Pickup lookup needs `CountryCode`, `City`, `Address`, `ProductCode`, and `Weight`; use address or `LatLng`, not both. Return the chosen `PointRelaisNum` to the merchant for review before placing it on an order.

CPSC eFiling is a regulatory submission. Do not submit it without a complete review of declaration type, core product, manufacturer, labs, point of contact, certificates, test date formats, and evidence. This skill provides the transport only; it does not validate legal compliance.

## Common failure codes

`1001` submission failure; `1002` customer code/API secret error; `1003` signature error; `1004` parameter error; `1006` no data; `1011` partial success; `2004` duplicate order number; `2005` existing order; `2006` no tracking number for method; `2008` tariff-prepay permission missing; `2009` weight must be positive; `2010` product cannot serve destination; `10000` request limit; `9999` platform exception. Do not retry a write blindly after an ambiguous timeout or platform error: query the order first.
