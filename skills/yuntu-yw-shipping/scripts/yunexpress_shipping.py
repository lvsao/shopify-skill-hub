#!/usr/bin/env python3
"""Safe YunExpress OMS API client. Credentials are loaded locally and never printed."""
import argparse
import base64
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

GET_OPERATIONS = {
    "countries": "/api/Common/GetCountry", "shipping-methods": "/api/Common/GetShippingMethods",
    "goods-types": "/api/Common/GetGoodsType", "quote": "/api/Freight/GetPriceTrial",
    "tracking-number": "/api/Waybill/GetTrackingNumber", "sender": "/api/WayBill/GetSender",
    "order": "/api/WayBill/GetOrder", "tracking": "/api/Tracking/GetTrackInfo",
    "all-tracking": "/api/Tracking/GetTrackAllInfo", "fee-detail": "/api/Freight/GetShippingFeeDetail",
}
POST_OPERATIONS = {
    "create-order": "/api/WayBill/CreateOrder", "update-weight": "/api/WayBill/UpdateWeight",
    "delete-order": "/api/WayBill/Delete", "intercept": "/api/WayBill/Intercept",
    "label": "/api/Label/Print", "carrier": "/api/Waybill/GetCarrier",
    "register-ioss": "/api/WayBill/RegisterIoss", "disable-ioss": "/api/WayBill/DisableIoss",
    "self-pickup-point": "/api/common/SelfPickupPoint",
    "subscribe-order": "/api/tracking/CreatedOrderSubscribe",
    "unsubscribe-order": "/api/tracking/CancelOrderSubscribe",
    "list-order-subscriptions": "/api/tracking/GetOrderSubscribe",
    "subscribe-product": "/api/tracking/CreatedProductSubscribe",
    "unsubscribe-product": "/api/tracking/CancelProductSubscribe",
    "list-product-subscriptions": "/api/tracking/GetProductSubscribe",
    "submit-cpsc-efiling": "/api/receive/cpscefiling",
}
WRITE_OPERATIONS = {"create-order", "update-weight", "delete-order", "intercept", "register-ioss", "disable-ioss", "subscribe-order", "unsubscribe-order", "subscribe-product", "unsubscribe-product", "submit-cpsc-efiling"}
REDACT_KEYS = {"street", "streetaddress1", "streetaddress2", "phone", "mobile", "mobilenumber", "email", "address", "address2", "address3", "apikey", "apisecret", "authorization", "password", "password"}

def load_env(path):
    values = dict(os.environ)
    if not path.exists():
        raise ValueError(f"Env file not found: {path}. Run init-env, fill it locally, and keep it private.")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    missing = [key for key in ("YUNTU_CUSTOMER_CODE", "YUNTU_API_SECRET", "YUNTU_OMS_BASE_URL") if not values.get(key)]
    if missing: raise ValueError("Missing required values: " + ", ".join(missing))
    return values

def parse_pairs(items):
    result = {}
    for item in items:
        if "=" not in item: raise ValueError(f"Expected Key=Value, got: {item}")
        key, value = item.split("=", 1); result[key] = value
    return result

def redact(value, key=""):
    if isinstance(value, dict): return {k: redact(v, k) for k, v in value.items()}
    if isinstance(value, list): return [redact(v, key) for v in value]
    return "[REDACTED]" if key.lower() in REDACT_KEYS and value not in (None, "") else value

def validate(operation, body):
    errors = []
    if operation == "create-order":
        if not isinstance(body, list) or not 1 <= len(body) <= 10: errors.append("create-order body must be an array containing 1-10 orders.")
        for i, order in enumerate(body if isinstance(body, list) else []):
            required = ["CustomerOrderNumber", "ShippingMethodCode", "Length", "Width", "Height", "PackageCount", "Weight", "Receiver", "Parcels"]
            missing = [x for x in required if order.get(x) in (None, "", [], {})]
            if missing: errors.append(f"order {i + 1}: missing " + ", ".join(missing))
            if not isinstance(order.get("Parcels"), list) or not order.get("Parcels"): errors.append(f"order {i + 1}: Parcels must be a non-empty array.")
            receiver = order.get("Receiver", {})
            if isinstance(receiver, dict):
                missing_receiver = [x for x in ("CountryCode", "FirstName", "Street", "City") if not receiver.get(x)]
                if missing_receiver: errors.append(f"order {i + 1}: Receiver missing " + ", ".join(missing_receiver))
    elif operation == "update-weight":
        for key in ("OrderNumber", "Weight"):
            if not isinstance(body, dict) or body.get(key) in (None, ""): errors.append(f"missing {key}")
    elif operation in {"delete-order", "intercept"}:
        for key in (("OrderType", "OrderNumber", "Remark") if operation == "intercept" else ("OrderType", "OrderNumber")):
            if not isinstance(body, dict) or body.get(key) in (None, ""): errors.append(f"missing {key}")
    return errors

def request(env, method, route, query=None, body=None):
    token = base64.b64encode(f"{env['YUNTU_CUSTOMER_CODE']}&{env['YUNTU_API_SECRET']}".encode()).decode()
    url = env["YUNTU_OMS_BASE_URL"].rstrip("/") + route
    if query: url += "?" + urlencode(query, doseq=True)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json", "Authorization": "Basic " + token}
    if data is not None: headers["Content-Type"] = "application/json; charset=utf-8"
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=45) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        try: detail = json.loads(detail)
        except json.JSONDecodeError: pass
        return err.code, detail
    except URLError as err: raise ValueError(f"Network error: {err.reason}") from err

def main():
    parser = argparse.ArgumentParser(description="Safe YunExpress Shipping API client")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init-env"); init.add_argument("--env", default="yunexpress-shipping.env")
    check = sub.add_parser("check"); check.add_argument("--env", default="yunexpress-shipping.env")
    get = sub.add_parser("get"); get.add_argument("operation", choices=GET_OPERATIONS); get.add_argument("--env", default="yunexpress-shipping.env"); get.add_argument("--query", nargs="*", default=[])
    post = sub.add_parser("post"); post.add_argument("operation", choices=POST_OPERATIONS); post.add_argument("--env", default="yunexpress-shipping.env"); post.add_argument("--input", required=True); post.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if args.command == "init-env":
        path = Path(args.env)
        if path.exists(): raise ValueError(f"Refusing to overwrite existing {path}.")
        path.write_text("# Keep this file private and ignored by Git. Use the YunExpress-supplied UAT URL for UAT.\nYUNTU_CUSTOMER_CODE=\nYUNTU_API_SECRET=\nYUNTU_OMS_BASE_URL=http://oms.api.yunexpress.com\n", encoding="utf-8")
        print(f"Created private template: {path}"); return
    env = load_env(Path(args.env))
    if args.command == "check":
        checks = [("countries", {}), ("shipping-methods", {"CountryCode": "GB"}), ("goods-types", {}), ("quote", {"CountryCode": "GB", "Weight": "0.125", "Length": "1", "Width": "1", "Height": "1", "PackageType": "0"})]
        output = {}
        for name, query in checks:
            status, data = request(env, "GET", GET_OPERATIONS[name], query=query)
            output[name] = {"http_status": status, "Code": data.get("Code") if isinstance(data, dict) else None, "Message": data.get("Message") if isinstance(data, dict) else str(data), "item_count": len(data.get("Items", [])) if isinstance(data, dict) and isinstance(data.get("Items"), list) else None}
        print(json.dumps(output, ensure_ascii=False, indent=2)); return
    if args.command == "get":
        status, data = request(env, "GET", GET_OPERATIONS[args.operation], query=parse_pairs(args.query))
    else:
        body = json.loads(Path(args.input).read_text(encoding="utf-8")); errors = validate(args.operation, body)
        if errors:
            print(json.dumps({"operation": args.operation, "validation_errors": errors}, ensure_ascii=False, indent=2)); sys.exit(2)
        if args.operation in WRITE_OPERATIONS and not args.execute:
            print(json.dumps({"operation": args.operation, "execution": "not sent", "reason": "This is a state-changing operation. Review this redacted preview, obtain explicit user approval, then add --execute.", "payload_preview": redact(body)}, ensure_ascii=False, indent=2)); return
        status, data = request(env, "POST", POST_OPERATIONS[args.operation], body=body)
    print(json.dumps({"http_status": status, "response": data}, ensure_ascii=False, indent=2))
    if status >= 400 or (isinstance(data, dict) and data.get("Code") not in (None, "0000")): sys.exit(1)

if __name__ == "__main__":
    try: main()
    except (ValueError, json.JSONDecodeError) as error:
        print(f"Error: {error}", file=sys.stderr); sys.exit(2)
