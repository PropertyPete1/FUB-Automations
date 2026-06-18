import getpass
import json
from pathlib import Path

import requests

BASE = "https://api.followupboss.com/v1"
OUT = Path("/home/ubuntu/fub_automation/data/fub_config_probe_results.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

ENDPOINTS = {
    "stages": ("/stages", {"limit": 100}),
    "ponds": ("/ponds", {"limit": 100}),
    "tags": ("/tags", {"limit": 500}),
    "sources": ("/sources", {"limit": 250}),
    "custom_fields": ("/customFields", {"limit": 250}),
}


def get(path, key, params=None):
    response = requests.get(
        f"{BASE}{path}",
        auth=(key, ""),
        headers={"Accept": "application/json"},
        params=params or {},
        timeout=30,
    )
    result = {"path": path, "status_code": response.status_code, "ok": response.ok}
    try:
        body = response.json()
    except Exception:
        body = {"text_preview": response.text[:500]}
    if response.ok:
        result["json"] = body
    else:
        result["error_preview"] = json.dumps(body)[:500]
    return result


def compact_value(item):
    if isinstance(item, str):
        return item
    if not isinstance(item, dict):
        return item
    return {
        k: item.get(k)
        for k in ["id", "name", "label", "type", "status", "isActive", "created", "updated"]
        if k in item
    }


def extract_list(payload, key_name):
    if not payload.get("ok"):
        return []
    data = payload.get("json", {})
    if isinstance(data, list):
        values = data
    else:
        values = data.get(key_name) or data.get("data") or data.get("items") or []
    return [compact_value(x) for x in values]


def main():
    key = getpass.getpass("Paste FUB API key for read-only config probe: ").strip()
    probes = {name: get(path, key, params) for name, (path, params) in ENDPOINTS.items()}
    output = {
        "status_codes": {name: p["status_code"] for name, p in probes.items()},
        "errors": {name: p.get("error_preview") for name, p in probes.items() if not p.get("ok")},
        "stages": extract_list(probes["stages"], "stages"),
        "ponds": extract_list(probes["ponds"], "ponds"),
        "tags": extract_list(probes["tags"], "tags"),
        "sources": extract_list(probes["sources"], "sources"),
        "custom_fields": extract_list(probes["custom_fields"], "customFields"),
    }
    OUT.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({
        "status_codes": output["status_codes"],
        "counts": {k: len(output[k]) for k in ["stages", "ponds", "tags", "sources", "custom_fields"]},
        "errors": output["errors"],
        "results_file": str(OUT),
    }, indent=2))


if __name__ == "__main__":
    main()
