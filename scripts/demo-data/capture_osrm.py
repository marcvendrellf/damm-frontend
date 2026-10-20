"""Save the OSRM route of every transport the demo planner can save, with the
same waypoints RouteMapTab asks for: depot, the stops in order, depot."""
import json, sys, time, urllib.request
from pathlib import Path

DATA = Path(sys.argv[1])
warehouse = json.loads((DATA / "warehouses.json").read_text())[0]
depot = (float(warehouse["lng"]), float(warehouse["lat"]))
out = DATA / "osrm"
out.mkdir(exist_ok=True)

for plan_file in sorted((DATA / "plans").glob("*.json")):
    for route in json.loads(plan_file.read_text())["persisted"].values():
        detail = route["detail"]
        target = out / f"{detail['transport_id']}.json"
        if target.exists():
            continue
        stops = [(s["lng"], s["lat"]) for s in detail["stops"]
                 if isinstance(s.get("lat"), (int, float)) and isinstance(s.get("lng"), (int, float))]
        coords = ";".join(f"{lng},{lat}" for lng, lat in [depot, *stops, depot])
        url = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=false"
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "smarttruck-demo-capture"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = json.load(r)
                break
            except Exception as e:
                print("retry", detail["transport_id"], e, flush=True)
                time.sleep(5)
        else:
            continue
        if data.get("code") != "Ok":
            print("no route", detail["transport_id"], data.get("code"), flush=True)
            continue
        target.write_text(json.dumps(data, separators=(",", ":")))
        print(detail["transport_id"], len(data["routes"][0]["geometry"]["coordinates"]), flush=True)
        time.sleep(1.2)

# Keep only what fetchOsrmRoute reads.
for f in out.glob("*.json"):
    data = json.loads(f.read_text())
    r = data["routes"][0]
    slim = {
        "code": data["code"],
        "routes": [{
            "distance": r["distance"],
            "geometry": {"type": "LineString",
                         "coordinates": [[round(x, 5), round(y, 5)] for x, y in r["geometry"]["coordinates"]]},
            "legs": [{"duration": l["duration"], "distance": l["distance"]} for l in r["legs"]],
        }],
        "waypoints": [{"location": w["location"]} for w in data["waypoints"]],
    }
    f.write_text(json.dumps(slim, separators=(",", ":")))
