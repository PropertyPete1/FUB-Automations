#!/usr/bin/env python3
from __future__ import annotations

from src.fub_automation.main import infer_city_from_text, summarize_lead_context_from_notes

TARGET_CITIES = ["San Antonio", "New Braunfels", "Austin", "Dallas", "Fort Worth", "Houston"]

notes = [
    {
        "body": "Client mentioned wanting San Antonio, prefers commute to downtown, phone 210-555-1212, email lead@example.com."
    },
    {
        "body": "Asked about new construction and payment comfort around rate changes."
    },
]

city = infer_city_from_text(" ".join(note["body"] for note in notes), TARGET_CITIES)
context = summarize_lead_context_from_notes(notes, city or "", TARGET_CITIES)
print(f"detected_city={city}")
print(f"context={context}")
assert city == "San Antonio"
assert "[phone]" in context
assert "[email]" in context
assert "210-555-1212" not in context
assert "lead@example.com" not in context
print("phase2_personalization_validation=passed")
