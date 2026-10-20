"""Write the static demo data the frontend reads in place of the backend:
catalog lists, the seeded transports and the captured optimizer plans,
trimmed to the fields the UI reads."""
import json, shutil, sys, urllib.request
from pathlib import Path

SEED = "http://127.0.0.1:8108"
PLANS = Path(sys.argv[1])
OUT = Path(sys.argv[2])

PRODUCT_KEYS = ("material_code", "description", "quantity", "unit", "category", "is_returnable")
PALLET_KEYS = ("pallet_index", "pallet_id", "stop_ids", "is_returnables", "products",
               "products_summary", "total_height_cm", "total_weight_kg", "total_volume_l")
LOAD_KEYS = ("transport_id", "truck_type", "vehicle_id", "date", "pallets",
             "pallet_slots_used", "pallet_slots_total")
STOP_KEYS = ("stop_id", "sequence", "customer_id", "customer_name", "address", "postal_code",
             "city", "lat", "lng", "time_window", "estimated_arrival", "products")
ROUTE_KEYS = ("transport_id", "route_code", "driver_id", "driver_name", "truck_type", "vehicle_id",
              "date", "shift", "ordered_stops", "total_stops", "total_distance_km", "total_time_min")
DETAIL_KEYS = ("transport_id", "route_code", "driver_id", "driver_name", "date", "truck_type",
               "start_time", "duration_min", "stops", "load_plan")


def pick(d, keys):
    return {k: d[k] for k in keys if k in d}


def product(p):
    return pick(p, PRODUCT_KEYS)


def stop(s):
    s = pick(s, STOP_KEYS)
    s["products"] = [product(p) for p in s.get("products") or []]
    return s


def load(l):
    if l is None:
        return None
    l = pick(l, LOAD_KEYS)
    l["pallets"] = [dict(pick(p, PALLET_KEYS), products=[product(x) for x in p.get("products") or []])
                    for p in l.get("pallets") or []]
    return l


def detail(d):
    d = pick(d, DETAIL_KEYS)
    d["stops"] = [stop(s) for s in d["stops"]]
    d["load_plan"] = load(d.get("load_plan"))
    return d


def get(path):
    with urllib.request.urlopen(SEED + path, timeout=120) as r:
        return json.load(r)


def write(rel, data):
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


if OUT.exists():
    shutil.rmtree(OUT)

for rel, path in [
    ("warehouses.json", "/api/v1/db/warehouses?limit=10000"),
    ("customers.json", "/api/v1/db/customers?limit=10000"),
    ("trucks.json", "/api/v1/db/trucks?limit=10000"),
    ("drivers.json", "/api/v1/db/drivers?limit=10000"),
    ("driver-zones.json", "/api/v1/data/drivers"),
    ("materials.json", "/api/v1/catalog/materials"),
    ("material-types.json", "/api/v1/catalog/material-types"),
]:
    write(rel, get(path))

order_keys = ("id", "customer_id", "material_id", "due_date", "quantity", "sales_unit", "delivered_flag")
write("orders.json", [pick(o, order_keys) for o in get("/api/v1/db/orders?limit=10000")])

transports = get("/api/v1/data/transports")
write("transports.json", transports)
for t in transports:
    write(f"transport/{t['transport_id']}.json", detail(get(f"/api/v1/data/transport/{t['transport_id']}")))

for f in sorted(PLANS.glob("*.json")):
    plan = json.loads(f.read_text())
    preview = plan["preview"]
    write(f"plans/{f.stem}.json", {
        "preview": {
            "job_id": preview["job_id"],
            "status": preview["status"],
            "error_message": preview.get("error_message"),
            "routes": [dict(pick(r, ROUTE_KEYS), ordered_stops=[stop(s) for s in r["ordered_stops"]])
                       for r in preview.get("routes") or []],
            "loads": [load(l) for l in preview.get("loads") or []],
        },
        "persisted": {sid: {"summary": p["summary"], "detail": detail(p["detail"])}
                      for sid, p in plan["persisted"].items()},
    })

print("transports", len(transports), "plans", len(list(PLANS.glob("*.json"))))
