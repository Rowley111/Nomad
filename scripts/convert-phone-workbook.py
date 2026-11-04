#!/usr/bin/env python3
"""Convert the supplied workbook's cached values; never execute Excel formulas.

No URL fetches, macros, external links or workbook instructions are executed.
The output is reference data, not a verified market feed or confirmed SKU list.
"""
import argparse
import base64
from datetime import datetime, timedelta
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def number(value):
    if value is None or str(value).strip() == "":
        return None
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError("Invalid nonnegative numeric cell")
    return int(result) if result.is_integer() else result


def excel_date(value, date1904=False):
    if value is None or str(value).strip() == "":
        return None
    try:
        day = float(value)
    except ValueError:
        return datetime.fromisoformat(str(value)).date().isoformat()
    if not math.isfinite(day) or not 0 <= day <= 100000:
        raise ValueError("Invalid date cell")
    origin = datetime(1904, 1, 1) if date1904 else datetime(1899, 12, 30)
    return (origin + timedelta(days=day)).date().isoformat()


def canonical_name(brand, model):
    if brand.casefold() == "apple" and model.casefold().startswith("iphone"):
        return model
    if model.casefold().startswith(brand.casefold() + " "):
        return model
    return brand + " " + model


def read_workbook(path):
    with ZipFile(path) as archive:
        if sum(item.file_size for item in archive.infolist()) > 96 * 1024 * 1024:
            raise ValueError("Workbook expands beyond 96 MiB")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(item.itertext()) for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        properties = workbook.find("s:workbookPr", NS)
        date1904 = properties is not None and properties.attrib.get("date1904") in ("1", "true")
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        sheets = {}
        formula_count = 0
        for sheet in workbook.find("s:sheets", NS):
            target = targets[sheet.attrib["{" + REL_NS + "}id"]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            if target not in archive.namelist():
                raise ValueError("Missing sheet relationship")
            if archive.getinfo(target).file_size > 32 * 1024 * 1024:
                raise ValueError("Sheet expands beyond 32 MiB")
            rows = []
            for row in ET.fromstring(archive.read(target)).findall(".//s:sheetData/s:row", NS):
                values = {}
                for cell in row:
                    column = re.sub(r"\d", "", cell.attrib["r"])
                    cached, inline = cell.find("s:v", NS), cell.find("s:is", NS)
                    value = (cached.text or "") if cached is not None else "".join(inline.itertext()) if inline is not None else ""
                    if cell.attrib.get("t") == "s":
                        value = strings[int(value)]
                    if cell.attrib.get("t") == "e":
                        raise ValueError("Workbook contains cached Excel errors")
                    formula_count += cell.find("s:f", NS) is not None
                    values[column] = value
                rows.append(values)
            sheets[sheet.attrib["name"]] = rows
    return sheets, date1904, formula_count


def convert(path):
    sheets, date1904, formula_count = read_workbook(path)
    settings = {row.get("A", ""): row for row in sheets["Настройки"][1:] if row.get("A")}
    calculated_on = excel_date(settings["Дата расчётного снимка"].get("B"), date1904)
    models, by_id, names = [], {}, set()
    for row in sheets["Модели"][1:]:
        identifier, brand, model = row.get("A"), row.get("B", "").strip(), row.get("C", "").strip()
        if not identifier or not brand or not model or identifier in by_id or (brand.casefold(), model.casefold()) in names:
            raise ValueError("Missing or duplicated model identity")
        record = {
            "id": identifier, "brand": brand, "model": model, "name": canonical_name(brand, model),
            "year": number(row.get("D")), "category": row.get("E", ""),
            "baseStorage": number(row.get("F")), "baseRam": number(row.get("G")),
            "baseUsedPrice": number(row.get("H")), "priceBasis": row.get("I", ""),
            "configStatus": row.get("J", ""), "checkedOn": None, "specCheckedOn": excel_date(row.get("K"), date1904),
            "source": row.get("L", ""), "note": row.get("M", ""),
            "ageYears": number(row.get("N")), "manualDiagnosis": row.get("O") == "1",
            "liquidity": number(row.get("P")), "baseCondition": row.get("Q", ""),
        }
        models.append(record)
        by_id[identifier] = record
        names.add((brand.casefold(), model.casefold()))
    variants, identifiers = [], set()
    for row in sheets["Каталог"][1:]:
        identifier, model_id = row.get("A"), row.get("U")
        if not identifier or identifier in identifiers or model_id not in by_id:
            raise ValueError("Missing, duplicated or orphaned variant identity")
        model = by_id[model_id]
        if row.get("B", "").strip() != model["brand"] or row.get("C", "").strip() != model["model"]:
            raise ValueError("Variant model reference does not match its name")
        record = {
            "id": identifier, "modelId": model_id, "brand": model["brand"], "model": model["model"], "name": model["name"],
            "storage": number(row.get("D")), "ram": number(row.get("E")), "year": number(row.get("F")),
            **{key: number(row.get(column)) for key, column in (("usedMin", "G"), ("usedReference", "H"), ("usedMax", "I"), ("quick", "J"), ("store", "K"), ("buyMin", "L"), ("buyMax", "M"), ("installment", "N"))},
            "memoryStatus": row.get("O", ""), "priceStatus": row.get("P", ""),
            "manualDiagnosis": model["manualDiagnosis"], "diagnosisNote": row.get("Q", ""),
            "source": row.get("R", ""), "olxSearchUrl": row.get("S", ""), "note": row.get("T", ""),
            "storageSteps": number(row.get("V")), "ramSteps": number(row.get("W")), "baseUsedPrice": number(row.get("X")),
            "ownUsedPrice": number(row.get("Y")), "checkedOn": excel_date(row.get("Z"), date1904),
            "calculatedOn": excel_date(row.get("AA"), date1904), "specCheckedOn": excel_date(row.get("AB"), date1904),
            "liquidity": number(row.get("AC")), "ageBuyFactor": number(row.get("AD")), "ownPriceSource": row.get("AE", ""),
        }
        if record["storage"] is None or record["storage"] <= 0 or (record["ram"] is not None and record["ram"] <= 0):
            raise ValueError("Invalid physical memory")
        for low, high in (("usedMin", "usedMax"), ("buyMin", "buyMax")):
            if record[low] is not None and record[high] is not None and record[low] > record[high]:
                raise ValueError("Reversed cached price range")
        variants.append(record)
        identifiers.add(identifier)
    counts = {
        "models": len(models), "variants": len(variants), "brands": len({row["brand"] for row in models}),
        "pricedVariants": sum(row["usedReference"] is not None for row in variants),
        "noPriceVariants": sum(row["usedReference"] is None for row in variants),
        "buyPricedVariants": sum(row["buyMax"] is not None for row in variants),
        "modelBasePrices": sum(row["baseUsedPrice"] is not None for row in models),
        "modelsWithSpecificationUrl": sum(bool(row["source"]) for row in models),
        "fractionalRamVariants": sum(row["ram"] is not None and row["ram"] % 1 != 0 for row in variants),
    }
    return {
        "id": "nomad-workbook-" + hashlib.sha256(path.read_bytes()).hexdigest()[:24],
        "name": path.name, "calculatedOn": calculated_on, "sourceType": "owner-workbook-estimate",
        "priceQuality": "unverified-editorial-estimate", "formulaHandling": "cached-values-only",
        "counts": counts, "models": models, "variants": variants,
        "settings": [{"name": name, "value": row.get("B", ""), "basis": row.get("C", "")} for name, row in settings.items()],
    }, formula_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path("src/data/workbook-reference.js"))
    args = parser.parse_args()
    data, formulas = convert(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    compressed = io.BytesIO()
    # An empty filename and fixed timestamp also make the gzip header portable.
    with gzip.GzipFile(filename="", mode="wb", fileobj=compressed, mtime=0, compresslevel=9) as stream:
        stream.write(raw)
    encoded = base64.b64encode(compressed.getvalue()).decode("ascii")
    content = (
        "// Compressed public reference data, not encryption, a live market feed or verified SKU claims.\n"
        "import { gunzipSync, strFromU8 } from \"fflate\";\n"
        "const encoded = \"" + encoded + "\";\n"
        "const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));\n"
        "export const workbookReference = JSON.parse(strFromU8(gunzipSync(bytes)));\n"
    )
    args.output.write_text(content, encoding="utf-8")
    print(json.dumps({"counts": data["counts"], "cachedFormulaCells": formulas, "calculatedOn": data["calculatedOn"], "rawBytes": len(raw), "gzipBytes": len(compressed.getvalue()), "outputBytes": len(content.encode("utf-8"))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
