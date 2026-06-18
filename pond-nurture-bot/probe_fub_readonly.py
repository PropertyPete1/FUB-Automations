import getpass
import json
import os
from pathlib import Path

import requests

BASE = "https://api.followupboss.com/v1"
OUT = Path("/home/ubuntu/fub_automation/data/fub_probe_results.json")
OUT.parent.mkdir(parents=True, exist_ok=True)


def get(path, key, params=None):
    response = requests.get(
        f"{BASE}{path}",
        auth=(key, ""),
        headers={"Accept": "application/json"},
        params=params or {},
        timeout=30,
    )
    result = {
        "path": path,
        "status_code": response.status_code,
        "ok": response.ok,
    }
    if response.ok:
        try:
            result["json"] = response.json()
        except Exception:
            result["text_preview"] = response.text[:500]
    else:
        result["error_preview"] = response.text[:500]
    return result


def summarize_users(payload):
    data = payload.get("json", {}) if payload.get("ok") else {}
    users = data.get("users") or data.get("data") or []
    summarized = []
    for u in users:
        name = u.get("name") or " ".join(filter(None, [u.get("firstName"), u.get("lastName")]))
        summarized.append({
            "id": u.get("id"),
            "name": name,
            "email": u.get("email"),
            "role": u.get("role"),
            "status": u.get("status"),
        })
    return summarized


def summarize_people(payload):
    data = payload.get("json", {}) if payload.get("ok") else {}
    people = data.get("people") or data.get("data") or []
    summarized = []
    for p in people:
        summarized.append({
            "id": p.get("id"),
            "name": p.get("name") or " ".join(filter(None, [p.get("firstName"), p.get("lastName")])),
            "stage": p.get("stage"),
            "assignedUserId": p.get("assignedUserId"),
            "assignedPondId": p.get("assignedPondId"),
            "tags": p.get("tags"),
            "lastActivity": p.get("lastActivity"),
            "lastCommunication": p.get("lastCommunication"),
        })
    return summarized


def main():
    key = getpass.getpass("Paste FUB API key for read-only probe: ").strip()
    if not key:
        raise SystemExit("No key provided")

    probes = {
        "users": get("/users", key, {"limit": 100}),
        "sample_people": get("/people", key, {"limit": 10, "fields": "allFields"}),
    }

    output = {
        "connection_ok": probes["users"].get("ok", False),
        "users_status_code": probes["users"].get("status_code"),
        "people_status_code": probes["sample_people"].get("status_code"),
        "users": summarize_users(probes["users"]),
        "peter_candidates": [u for u in summarize_users(probes["users"]) if "peter" in str(u.get("name", "")).lower() or "peter" in str(u.get("email", "")).lower()],
        "sample_people": summarize_people(probes["sample_people"]),
        "errors": {k: v.get("error_preview") for k, v in probes.items() if not v.get("ok")},
    }
    OUT.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({
        "connection_ok": output["connection_ok"],
        "users_found": len(output["users"]),
        "peter_candidates_found": len(output["peter_candidates"]),
        "sample_people_found": len(output["sample_people"]),
        "results_file": str(OUT),
        "errors": output["errors"],
    }, indent=2))


if __name__ == "__main__":
    main()
