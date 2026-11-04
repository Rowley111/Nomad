"""Lossless, deterministic merging of local workspace backups.

This module never overwrites a server record. Validation of the resulting full
workspace is performed by the shared domain worker before a preview is issued.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Any


COLLECTIONS = (
    "inventory", "prices", "priceHistory", "assessments", "events", "catalog",
    "repairOrders", "repairTypes", "materialCatalog", "repairEvents",
    "repairLosses", "setupImports",
)


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def _identity(row: dict) -> str:
    if row.get("id") is not None:
        return "id:" + str(row["id"])
    # Older history entries may not carry an ID. Content identity makes repeated
    # import safe without manufacturing identifiers or historical timestamps.
    return "content:" + hashlib.sha256(_canonical(row).encode()).hexdigest()


def _price_identity(row: dict) -> str:
    """Match the frontend priceKey, including owner-guide's separate channel."""
    base = row.get("base") or {}
    return _canonical([
        row.get("model"), row.get("storage"),
        row.get("ram") if row.get("ram") is not None else "",
        row.get("sim") if row.get("sim") is not None else "physical",
        row.get("market"), row.get("currency"),
        row.get("channel"), base.get("screen"), base.get("body"),
        base.get("box"), base.get("battery")
        if base.get("battery") is not None else "unknown",
        row.get("source") if row.get("source") in ("owner-guide", "owner-buy") else "",
    ])


def _without_id(row: dict) -> dict:
    return {key: value for key, value in row.items() if key != "id"}


def _conflict(report: dict, collection: str, identifier: Any,
              reason: str = "Запись отличается; сохранена серверная версия") -> None:
    report["conflicts"].append({
        "collection": collection, "id": str(identifier), "reason": reason,
    })


def _add(report: dict, collection: str) -> None:
    report["added"][collection] += 1
    report["totalAdded"] += 1


def _merge_rows(collection: str, existing: list, incoming: list,
                report: dict) -> list:
    result = deepcopy(existing)
    by_id = {_identity(row): row for row in result}
    natural = {_price_identity(row): row for row in result} \
        if collection == "prices" else {}
    purchases = {row["purchaseToken"]: row for row in result
                 if row.get("purchaseToken")} if collection == "inventory" else {}
    for row in incoming:
        identity = _identity(row)
        old = by_id.get(identity)
        if old is None and collection == "prices":
            old = natural.get(_price_identity(row))
        if old is None and collection == "inventory" and row.get("purchaseToken"):
            old = purchases.get(row["purchaseToken"])
        if old is not None:
            left, right = old, row
            if collection in ("prices", "inventory") and _identity(old) != identity:
                left, right = _without_id(old), _without_id(row)
            if _canonical(left) == _canonical(right):
                report["duplicates"][collection] += 1
            else:
                _conflict(report, collection, row.get("id", identity))
            continue
        copied = deepcopy(row)
        result.append(copied)
        by_id[identity] = copied
        if collection == "prices":
            natural[_price_identity(row)] = copied
        if collection == "inventory" and copied.get("purchaseToken"):
            purchases[copied["purchaseToken"]] = copied
        _add(report, collection)
    return result


def _merge_catalog(existing: list, incoming: list, report: dict) -> list:
    result = deepcopy(existing)
    by_name = {row["name"]: row for row in result}
    for row in incoming:
        old = by_name.get(row["name"])
        if old is None:
            copied = deepcopy(row)
            result.append(copied)
            by_name[row["name"]] = copied
            _add(report, "catalog")
            continue
        if _canonical(old) == _canonical(row):
            report["duplicates"]["catalog"] += 1
            continue
        # Model metadata remains authoritative on the server, while genuinely
        # additional storage/RAM configurations may be brought across.
        old_meta = {key: value for key, value in old.items() if key != "configs"}
        new_meta = {key: value for key, value in row.items() if key != "configs"}
        if _canonical(old_meta) != _canonical(new_meta):
            _conflict(report, "catalog", row["name"],
                      "Описание модели отличается; сохранено серверное описание")
        configs = {(config.get("storage"), config.get("ram")): config
                   for config in old.get("configs", [])}
        for config in row.get("configs", []):
            key = (config.get("storage"), config.get("ram"))
            previous = configs.get(key)
            if previous is None:
                copied = deepcopy(config)
                old.setdefault("configs", []).append(copied)
                configs[key] = copied
                # Report configurations separately from model count so preview
                # explains why an already existing model changes.
                report["catalogConfigurationsAdded"] += 1
                report["totalAdded"] += 1
            elif _canonical(previous) != _canonical(config):
                _conflict(report, "catalog", f"{row['name']}:{key[0]}/{key[1]}",
                          "Конфигурация отличается; сохранена серверная версия")
    return result


def merge_local_state(current: dict | None, incoming: dict) -> tuple[dict, dict]:
    """Merge a validated schema-2 local backup without replacing existing data.

    Both inputs are left untouched. Conflicts are reported, never resolved by
    last-write-wins. A first import preserves every historical field verbatim.
    """
    if not isinstance(incoming, dict) or incoming.get("schemaVersion") != 2 \
            or incoming.get("mode") != "local":
        raise ValueError("Нужна полная локальная копия schemaVersion 2")
    _canonical(incoming)  # Reject NaN/Infinity even outside validated collections.
    for name in COLLECTIONS:
        if name in incoming and (not isinstance(incoming[name], list)
                                 or any(not isinstance(row, dict)
                                        for row in incoming[name])):
            raise ValueError("Некорректный массив " + name)
    report = {
        "added": {key: 0 for key in COLLECTIONS},
        "duplicates": {key: 0 for key in COLLECTIONS},
        "conflicts": [], "totalAdded": 0, "catalogConfigurationsAdded": 0,
    }
    if current is None:
        result = deepcopy(incoming)
        for name in COLLECTIONS:
            report["added"][name] = len(incoming.get(name, []))
            report["totalAdded"] += report["added"][name]
        return result, report
    if not isinstance(current, dict) or current.get("schemaVersion") != 2:
        raise ValueError("Неподдерживаемая серверная схема")
    result = deepcopy(current)
    for key, value in incoming.items():
        if key in COLLECTIONS:
            if key == "catalog":
                result[key] = _merge_catalog(result.get(key, []), value, report)
            else:
                result[key] = _merge_rows(key, result.get(key, []), value, report)
        elif key not in result:
            result[key] = deepcopy(value)
        elif _canonical(result[key]) != _canonical(value):
            _conflict(report, key, key,
                      "Настройка отличается; сохранено серверное значение")
    return result, report
