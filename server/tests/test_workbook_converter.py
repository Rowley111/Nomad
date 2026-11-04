"""Synthetic XLSX tests; the owner's original workbook is not required in CI."""
import importlib.util
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("nomad_workbook_converter", ROOT / "scripts/convert-phone-workbook.py")
CONVERTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONVERTER)
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def workbook(tmp_path, duplicate=False, orphan=False):
    path = tmp_path / "source.xlsx"
    root = ET.Element("workbook", xmlns=MAIN)
    sheets = ET.SubElement(root, "sheets")
    rels = ET.Element("Relationships", xmlns="http://schemas.openxmlformats.org/package/2006/relationships")
    model = {"A": "model-one", "B": "Samsung", "C": "Galaxy Example", "D": 2024, "E": "Смартфон", "F": 128, "G": 8, "H": 78000, "I": "Редакторский ориентир", "J": "Справочно", "O": 0, "P": 1}
    variant = {"A": "variant-one", "B": "Samsung", "C": "Galaxy Example", "D": 128, "E": 8,
               "G": 62000, "H": ("WEBSERVICE(\"https://invalid.test/never-fetch\")", 79000),
               "I": 94000, "J": 70000, "K": 86000, "L": 0, "M": 0,
               "N": ("IF(TRUE,\"\",1)", None), "O": "Справочно", "P": "Черновик",
               "U": "missing-model" if orphan else "model-one", "AA": 46330}
    payloads = {
        "Настройки": [{"A": "Заголовок"}, {"A": "Дата расчётного снимка", "B": 46330}],
        "Модели": [{"A": "Заголовок"}, model],
        "Каталог": [{"A": "Заголовок"}, variant] + ([variant] if duplicate else []),
    }
    with ZipFile(path, "w") as archive:
        for index, (name, rows) in enumerate(payloads.items(), 1):
            ET.SubElement(sheets, "sheet", {"name": name, "sheetId": str(index), "{" + REL + "}id": "rId" + str(index)})
            ET.SubElement(rels, "Relationship", Id="rId" + str(index), Target="worksheets/sheet" + str(index) + ".xml")
            xml = ET.Element("worksheet", xmlns=MAIN)
            data = ET.SubElement(xml, "sheetData")
            for row_number, values in enumerate(rows, 1):
                row = ET.SubElement(data, "row", r=str(row_number))
                for column, value in values.items():
                    cell = ET.SubElement(row, "c", r=column + str(row_number))
                    if isinstance(value, tuple):
                        formula, cached = value
                        ET.SubElement(cell, "f").text = formula
                        if cached is not None:
                            ET.SubElement(cell, "v").text = str(cached)
                    elif isinstance(value, (int, float)):
                        ET.SubElement(cell, "v").text = str(value)
                    else:
                        cell.set("t", "inlineStr")
                        ET.SubElement(ET.SubElement(cell, "is"), "t").text = value
            archive.writestr("xl/worksheets/sheet" + str(index) + ".xml", ET.tostring(xml))
        archive.writestr("xl/workbook.xml", ET.tostring(root))
        archive.writestr("xl/_rels/workbook.xml.rels", ET.tostring(rels))
    return path


def test_cached_formula_values_are_used_without_evaluating_formula_or_fetching_urls(tmp_path):
    data, formulas = CONVERTER.convert(workbook(tmp_path))
    assert formulas == 2
    assert data["variants"][0]["usedReference"] == 79000
    assert data["variants"][0]["installment"] is None
    assert data["variants"][0]["buyMax"] == 0
    assert data["variants"][0]["checkedOn"] is None
    assert data["variants"][0]["calculatedOn"] == "2026-11-04"
    assert data["models"][0]["name"] == "Samsung Galaxy Example"


def test_duplicate_or_orphaned_variants_are_rejected(tmp_path):
    with pytest.raises(ValueError, match="variant identity"):
        CONVERTER.convert(workbook(tmp_path, duplicate=True))
    with pytest.raises(ValueError, match="variant identity"):
        CONVERTER.convert(workbook(tmp_path, orphan=True))


def test_converted_identity_is_deterministic_and_does_not_expose_local_source_path(tmp_path):
    path = workbook(tmp_path)
    first, _ = CONVERTER.convert(path)
    second, _ = CONVERTER.convert(path)
    assert first == second
    assert str(tmp_path) not in json.dumps(first)


def test_blank_zero_fractional_memory_and_excel_epoch_stay_distinct():
    assert CONVERTER.number("") is None
    assert CONVERTER.number("0") == 0
    assert CONVERTER.number("0.75") == 0.75
    assert CONVERTER.excel_date("46330") == "2026-11-04"
    assert CONVERTER.excel_date("0", date1904=True) == "1904-01-01"
    for value in ("NaN", "Infinity", "-1"):
        with pytest.raises(ValueError):
            CONVERTER.number(value)
