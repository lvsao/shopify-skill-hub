#!/usr/bin/env python3
"""Safe Yanwen order and tracking API client; credentials are never printed."""
import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

READ_METHODS = {"countries": "common.country.getlist", "warehouses": "common.warehouse.getlist", "channels": "express.channel.getlist", "order": "express.order.get", "orders": "express.order.getlist", "label": "express.order.label.get", "verify-kr-pccc": "common.verify.kr.pccc", "quote": "calc.list", "overseas-handover": "calc.handoverCode", "standard-goods": "common.import_customs.standard_goods.get"}
WRITE_METHODS = {"create-order": "express.order.create", "cancel-order": "express.order.cancel", "forecast-weight": "express.order.forecast_import", "upload-temu-label": "express.order.customer_label.import", "create-customs-parcel": "s3.express.create", "create-customs-bag": "s3.bag.create", "create-customs-mawb": "s3.mawb.create", "create-overseas-manifest": "express.overseas.manifest.create"}
REDACT = {"address", "address2", "phone", "email", "taxnumber", "apitoken", "authorization", "labelbase64"}

def load_env(path):
    values = dict(os.environ)
    if not path.exists(): raise ValueError(f"Env file not found: {path}. Run init-env and keep it private.")
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1); values[key.strip()] = value.strip().strip('"').strip("'")
    missing = [x for x in ("YANWEN_USER_ID", "YANWEN_API_TOKEN", "YANWEN_API_BASE_URL") if not values.get(x)]
    if missing: raise ValueError("Missing: " + ", ".join(missing))
    return values

def redact(value, key=""):
    if isinstance(value, dict): return {k: redact(v, k) for k, v in value.items()}
    if isinstance(value, list): return [redact(x, key) for x in value]
    return "[REDACTED]" if key.lower() in REDACT and value not in (None, "") else value

def request(env, method, body):
    compact = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000)); user = env["YANWEN_USER_ID"]; token = env["YANWEN_API_TOKEN"]
    source = token + user + compact + "json" + method + timestamp + "V1.0" + token
    query = {"user_id": user, "method": method, "format": "json", "timestamp": timestamp, "sign": hashlib.md5(source.encode("utf-8")).hexdigest(), "version": "V1.0"}
    url = env["YANWEN_API_BASE_URL"].rstrip("/") + "?" + urlencode(query)
    try:
        req = Request(url, data=compact.encode("utf-8"), headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        with urlopen(req, timeout=45) as response: return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try: raw = json.loads(raw)
        except json.JSONDecodeError: pass
        return exc.code, raw
    except URLError as exc: raise ValueError(f"Network error: {exc.reason}") from exc

def track(env, numbers):
    if not 1 <= len(numbers.split(",")) <= 30: raise ValueError("Track 1-30 comma-separated numbers.")
    url = "http://api.track.yw56.com.cn/api/tracking?" + urlencode({"nums": numbers})
    req = Request(url, headers={"Authorization": env["YANWEN_USER_ID"]}, method="GET")
    with urlopen(req, timeout=45) as response: return response.status, json.loads(response.read().decode("utf-8"))

def validate_create(body):
    errors = []; required = ("channelId", "orderSource", "orderNumber", "receiverInfo", "parcelInfo")
    if not isinstance(body, dict): return ["create-order payload must be an object."]
    errors += [f"missing {key}" for key in required if body.get(key) in (None, "", [], {})]
    receiver = body.get("receiverInfo", {}); parcel = body.get("parcelInfo", {})
    if isinstance(receiver, dict): errors += [f"receiverInfo missing {key}" for key in ("name", "country", "address") if not receiver.get(key)]
    if isinstance(parcel, dict):
        errors += [f"parcelInfo missing {key}" for key in ("hasBattery", "currency", "totalQuantity", "totalWeight", "productList") if parcel.get(key) in (None, "", [], {})]
    return errors

def output(status, payload):
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict) and "base64String" in payload["data"]:
        data = dict(payload["data"]); data["base64String"] = f"[omitted: {len(data['base64String'] or '')} characters]"; payload = dict(payload, data=data)
    print(json.dumps({"http_status": status, "response": payload}, ensure_ascii=False, indent=2))
    if status >= 400 or (isinstance(payload, dict) and not payload.get("success", False)): sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Safe Yanwen Shipping API client")
    subs = parser.add_subparsers(dest="command", required=True)
    init = subs.add_parser("init-env"); init.add_argument("--env", default="yanwen-shipping.env")
    check = subs.add_parser("check"); check.add_argument("--env", default="yanwen-shipping.env")
    get = subs.add_parser("get"); get.add_argument("operation", choices=[*READ_METHODS, "track"]); get.add_argument("--env", default="yanwen-shipping.env"); get.add_argument("--input"); get.add_argument("--numbers")
    post = subs.add_parser("post"); post.add_argument("operation", choices=WRITE_METHODS); post.add_argument("--env", default="yanwen-shipping.env"); post.add_argument("--input", required=True); post.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if args.command == "init-env":
        path = Path(args.env)
        if path.exists(): raise ValueError(f"Refusing to overwrite {path}.")
        path.write_text("# Keep this private and ignored by Git. Replace with https://open-fat.yw56.com.cn/api/order only for Yanwen testing.\nYANWEN_USER_ID=\nYANWEN_API_TOKEN=\nYANWEN_API_BASE_URL=https://open.yw56.com.cn/api/order\n", encoding="utf-8"); print(f"Created private template: {path}"); return
    env = load_env(Path(args.env))
    if args.command == "check":
        result = {}
        for operation in ("countries", "channels", "warehouses"):
            status, payload = request(env, READ_METHODS[operation], {})
            items = payload.get("data") if isinstance(payload, dict) else None
            result[operation] = {"http_status": status, "success": payload.get("success") if isinstance(payload, dict) else False, "code": payload.get("code") if isinstance(payload, dict) else None, "message": payload.get("message") if isinstance(payload, dict) else str(payload), "item_count": len(items) if isinstance(items, list) else None}
        print(json.dumps(result, ensure_ascii=False, indent=2)); return
    if args.command == "get":
        if args.operation == "track":
            if not args.numbers: raise ValueError("track requires --numbers.")
            status, payload = track(env, args.numbers)
        else:
            body = json.loads(Path(args.input).read_text(encoding="utf-8")) if args.input else {}
            status, payload = request(env, READ_METHODS[args.operation], body)
        output(status, payload); return
    body = json.loads(Path(args.input).read_text(encoding="utf-8"))
    errors = validate_create(body) if args.operation == "create-order" else []
    if errors: print(json.dumps({"operation": args.operation, "validation_errors": errors}, ensure_ascii=False, indent=2)); sys.exit(2)
    if not args.execute:
        print(json.dumps({"operation": args.operation, "execution": "not sent", "reason": "State-changing operation: obtain explicit user approval, then add --execute.", "payload_preview": redact(body)}, ensure_ascii=False, indent=2)); return
    status, payload = request(env, WRITE_METHODS[args.operation], body); output(status, payload)

if __name__ == "__main__":
    try: main()
    except (ValueError, json.JSONDecodeError) as error: print(f"Error: {error}", file=sys.stderr); sys.exit(2)
