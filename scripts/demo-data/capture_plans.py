"""Run the optimizer for every selectable date on scratch backends, save each
suggested route, and keep the preview and the saved transports as fixtures."""
import json, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(sys.argv[1])
PORTS = [8101, 8102, 8103, 8104, 8105, 8106, 8107]
WAREHOUSE = "40da895f-8aac-40c5-a71a-8bd681414b7b"


def call(port, path, body=None):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def persist_body(route, load):
    # Mirrors persistSuggestedRoute in src/lib/api/optimize.ts.
    return {
        "route": {
            "transport_id": route["transport_id"],
            "route_code": route["route_code"],
            "driver_id": route.get("driver_id") or "",
            "driver_name": route.get("driver_name") or "—",
            "truck_type": route.get("truck_type") or "8pal",
            "vehicle_id": route.get("vehicle_id") or None,
            "date": route["date"],
            "shift": 1,
            "ordered_stops": [
                {
                    "stop_id": s["stop_id"],
                    "sequence": s["sequence"],
                    "customer_id": s["customer_id"],
                    "customer_name": s.get("customer_name") or "—",
                    "address": "",
                    "postal_code": "",
                    "city": s.get("city") or "",
                    "lat": s.get("lat"),
                    "lng": s.get("lng"),
                    "products": s.get("products") or [],
                }
                for s in route["ordered_stops"]
            ],
            "total_stops": len(route["ordered_stops"]),
        },
        "warehouse_id": WAREHOUSE,
        "load": load,
    }


def run_date(port, date):
    preview = call(port, "/api/v1/optimize/full/preview", {
        "date": date, "warehouse_id": WAREHOUSE, "max_orders": 200,
        "respect_time_windows": False, "solver_time_limit_s": 25,
    })["result"]
    routes = preview.get("routes") or ([preview["route"]] if preview.get("route") else [])
    loads = {l["transport_id"]: l for l in preview.get("loads") or []}
    saved = {}
    for route in routes:
        res = call(port, "/api/v1/optimize/persist", persist_body(route, loads.get(route["transport_id"])))
        saved[route["transport_id"]] = res["transport_id"]
    summaries = {t["transport_id"]: t for t in call(port, "/api/v1/data/transports")}
    persisted = {}
    for n, (suggestion_id, real_id) in enumerate(saved.items(), start=1):
        demo_id = f"opt-{date}-{n}"
        detail = call(port, f"/api/v1/data/transport/{real_id}")
        summary = summaries[real_id]
        detail["transport_id"] = summary["transport_id"] = demo_id
        if detail.get("load_plan"):
            detail["load_plan"]["transport_id"] = demo_id
        persisted[suggestion_id] = {"summary": summary, "detail": detail}
    (OUT / f"{date}.json").write_text(json.dumps({"preview": preview, "persisted": persisted}))
    print(date, port, len(routes), "routes", flush=True)


def worker(args):
    port, dates = args
    for d in dates:
        if not (OUT / f"{d}.json").exists():
            run_date(port, d)


dates = sorted(json.loads(sys.argv[2]))
jobs = [(p, dates[i::len(PORTS)]) for i, p in enumerate(PORTS)]
with ThreadPoolExecutor(len(PORTS)) as ex:
    list(ex.map(worker, jobs))
