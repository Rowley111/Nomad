from copy import deepcopy
import unittest

from server.imports import merge_local_state


def workspace():
    return {
        "schemaVersion": 2, "mode": "local", "policy": {"markup": 25},
        "inventory": [], "prices": [], "priceHistory": [], "assessments": [],
        "events": [], "catalog": [], "repairOrders": [], "repairTypes": [],
        "materialCatalog": [], "repairEvents": [], "repairLosses": [],
    }


def price(identifier="p1", amount=89000):
    return {
        "id": identifier, "model": "Samsung Galaxy A35 5G", "storage": 128,
        "ram": 8, "sim": "physical", "market": "Астана", "currency": "KZT",
        "channel": "store-cash", "base": {
            "screen": "good", "body": "good", "box": True, "battery": None,
        }, "price": amount, "source": "owner", "author": "Владелец",
    }


class LocalImportTests(unittest.TestCase):
    def test_initial_import_keeps_legacy_unknowns_and_zero_buy(self):
        source = workspace()
        source["inventory"] = [{"id": 7, "buy": 0, "status": "Продан",
                                "sale": None, "legacySold": True}]
        source["oldHistory"] = {"unverified": True}
        original = deepcopy(source)
        merged, report = merge_local_state(None, source)
        self.assertEqual(merged, original)
        self.assertEqual(report["added"]["inventory"], 1)
        self.assertIsNone(merged["inventory"][0]["sale"])
        merged["inventory"][0]["buy"] = 100
        self.assertEqual(source, original)

    def test_repeated_import_deduplicates_every_collection(self):
        source = workspace()
        for key in ("inventory", "prices", "priceHistory", "assessments", "events",
                    "repairOrders", "repairTypes", "materialCatalog", "repairEvents",
                    "repairLosses"):
            source[key] = [{"id": key}]
        source["prices"] = [price()]
        first, _ = merge_local_state(None, source)
        merged, report = merge_local_state(first, source)
        self.assertEqual(merged, first)
        self.assertEqual(report["totalAdded"], 0)
        self.assertEqual(report["conflicts"], [])
        self.assertEqual(report["duplicates"]["repairLosses"], 1)

    def test_conflicting_ids_preserve_current_records_and_report(self):
        current, incoming = workspace(), workspace()
        current["inventory"] = [{"id": "phone", "buy": 50000}]
        incoming["inventory"] = [{"id": "phone", "buy": 90000},
                                 {"id": "new", "buy": 0}]
        incoming["policy"]["markup"] = 80
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(merged["inventory"][0]["buy"], 50000)
        self.assertEqual(merged["policy"]["markup"], 25)
        self.assertEqual(report["added"]["inventory"], 1)
        self.assertEqual({x["collection"] for x in report["conflicts"]},
                         {"inventory", "policy"})
        self.assertEqual(len(current["inventory"]), 1)

    def test_prices_use_natural_key_and_do_not_duplicate_other_ids(self):
        current, incoming = workspace(), workspace()
        current["prices"] = [price()]
        incoming["prices"] = [price("from-other-browser")]
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(merged["prices"], current["prices"])
        self.assertEqual(report["duplicates"]["prices"], 1)
        incoming["prices"][0]["price"] = 91000
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(merged["prices"][0]["price"], 89000)
        self.assertEqual(report["conflicts"][0]["collection"], "prices")

    def test_prices_keep_configuration_base_and_guide_channels_separate(self):
        current, incoming = workspace(), workspace()
        current["prices"] = [price()]
        for identifier, field, value in (
            ("memory", "storage", 256), ("esim", "sim", "esim"),
            ("guide", "source", "owner-guide"),
        ):
            row = price(identifier)
            row[field] = value
            incoming["prices"].append(row)
        row = price("nobox")
        row["base"]["box"] = False
        incoming["prices"].append(row)
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(len(merged["prices"]), 5)
        self.assertEqual(report["added"]["prices"], 4)

    def test_catalog_adds_configs_preserves_conflicts_then_repeats_safely(self):
        current, incoming = workspace(), workspace()
        current["catalog"] = [{"name": "iPhone 13", "brand": "Apple", "source": "official",
                               "configs": [{"storage": 128, "ram": None}]}]
        incoming["catalog"] = [{"name": "iPhone 13", "brand": "Apple", "source": "other",
                                "configs": [{"storage": 128, "ram": None},
                                            {"storage": 256, "ram": None}]}]
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(merged["catalog"][0]["source"], "official")
        self.assertEqual(len(merged["catalog"][0]["configs"]), 2)
        self.assertEqual(report["catalogConfigurationsAdded"], 1)
        repeated, again = merge_local_state(merged, incoming)
        self.assertEqual(repeated, merged)
        self.assertEqual(again["totalAdded"], 0)

    def test_history_without_ids_has_stable_content_identity(self):
        source = workspace()
        source["priceHistory"] = [{"at": "2026-10-01", "before": 500, "after": 600}]
        merged, report = merge_local_state(source, deepcopy(source))
        self.assertEqual(merged["priceHistory"], source["priceHistory"])
        self.assertEqual(report["duplicates"]["priceHistory"], 1)

    def test_signed_losses_are_preserved_once(self):
        source = workspace()
        source["repairLosses"] = [{"id": "loss", "amount": -5000,
                                   "lostOn": "2026-10-16", "reason": "Материал"}]
        merged, _ = merge_local_state(None, source)
        repeated, report = merge_local_state(merged, source)
        self.assertEqual(repeated["repairLosses"][0]["amount"], -5000)
        self.assertEqual(len(repeated["repairLosses"]), 1)
        self.assertEqual(report["totalAdded"], 0)

    def test_purchase_token_prevents_duplicate_inventory_with_another_id(self):
        current = workspace()
        row = {"id": "first", "model": "A35", "buy": 50000, "sell": 89000,
               "purchaseToken": "one-confirmed-purchase"}
        current["inventory"] = [row]
        incoming = deepcopy(current)
        incoming["inventory"][0]["id"] = "another-id"
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(merged["inventory"], [row])
        self.assertEqual(report["duplicates"]["inventory"], 1)
        incoming["inventory"][0]["buy"] = 100
        merged, report = merge_local_state(current, incoming)
        self.assertEqual(merged["inventory"], [row])
        self.assertTrue(any(item["collection"] == "inventory" for item in report["conflicts"]))

    def test_invalid_input_fails_without_mutating_current(self):
        for incoming in (None, [], {"schemaVersion": 1},
                         {**workspace(), "prices": "bad"},
                         {**workspace(), "prices": [None]},
                         {**workspace(), "x": float("nan")}):
            with self.subTest(incoming=incoming), self.assertRaises(ValueError):
                merge_local_state(workspace(), incoming)


if __name__ == "__main__":
    unittest.main()
