// Device facts only. No price in this module is implied by catalogue presence.
// See docs/CATALOG_XIAOMI_BBK.md for scope, verification and regional limits.
const xiaomiIndex = "https://www.mi.com/global/support/android-enterprise-recommended/";
const xiaomiArchive = "https://www.mi.com/es/product-list/xiaomi/";
const oppoIndex = "https://www.oppo.com/en/smartphones/";
const realmeIndex = "https://www.realme.com/global/support/user-manuals";
const pairs = (values) => values.map(([ram, storage]) => ({ storage, ram }));
const phone = (name, brand, source, values = [], biometric = "unknown") => ({
  name, brand, deviceType: "phone", connectivity: "phone", biometric,
  configs: pairs(values), source, verified: values.length > 0,
});
const mi = (name, brand, slug, values) => phone(name, brand,
  `https://www.mi.com/global/product/${slug}/specs/`, values);
const tablet = (name, brand, source, values = [], connectivity = "wifi") => ({
  name, brand, deviceType: "tablet", connectivity, biometric: "unknown",
  configs: pairs(values), source, verified: values.length > 0,
});

export const xiaomiBbkCatalog = [
  mi("Xiaomi 14", "Xiaomi", "xiaomi-14", [[12, 256], [12, 512]]),
  mi("Xiaomi 14T", "Xiaomi", "xiaomi-14t", [[12, 256], [12, 512]]),
  phone("Xiaomi 13T", "Xiaomi", "https://www.mi.com/jp/product/xiaomi-13t/specs/", [[8, 256]]),
  phone("Xiaomi 13 Ultra", "Xiaomi", xiaomiArchive, [[12, 512]]),
  phone("Xiaomi 13 Pro", "Xiaomi", xiaomiArchive, [[12, 256]]),
  phone("Xiaomi 13", "Xiaomi", xiaomiArchive, [[12, 256]]),
  phone("Xiaomi 13 Lite", "Xiaomi", xiaomiArchive, [[8, 128]]),
  phone("Xiaomi 12T Pro", "Xiaomi", xiaomiArchive, [[12, 256]]),
  phone("Xiaomi 12T", "Xiaomi", xiaomiArchive, [[8, 256]]),
  phone("Xiaomi 12 Pro", "Xiaomi", xiaomiArchive, [[12, 256]]),
  phone("Xiaomi 12 Lite", "Xiaomi", xiaomiArchive, [[8, 256]]),
  ...["Xiaomi 12", "Xiaomi 11T", "Xiaomi 11T Pro", "Xiaomi 11 Lite 5G NE"].map(
    (name) => phone(name, "Xiaomi", xiaomiIndex)),
  phone("Xiaomi 12X", "Xiaomi", xiaomiArchive),
  phone("Xiaomi 13T Pro", "Xiaomi", xiaomiIndex),

  mi("Redmi 13 4G", "Redmi", "redmi-13", [[6, 128], [8, 128], [8, 256]]),
  mi("Redmi 13C 4G", "Redmi", "redmi-13c", [[4, 128], [6, 128], [8, 256]]),
  mi("Redmi Note 13 4G", "Redmi", "redmi-note-13", [[6, 128], [8, 128], [8, 256]]),
  mi("Redmi Note 13 5G", "Redmi", "redmi-note-13-5g", [[6, 128], [8, 256]]),
  mi("Redmi Note 13 Pro 4G", "Redmi", "redmi-note-13-pro", [[8, 256], [12, 512]]),
  mi("Redmi Note 13 Pro 5G", "Redmi", "redmi-note-13-pro-5g", [[8, 256], [12, 512]]),
  mi("Redmi Note 13 Pro+ 5G", "Redmi", "redmi-note-13-pro-plus-5g", [[8, 256], [12, 512]]),
  mi("Redmi Note 14 4G", "Redmi", "redmi-note-14", [[6, 128], [8, 128], [8, 256]]),
  mi("Redmi Note 14 5G", "Redmi", "redmi-note-14-5g", [[6, 128], [8, 256], [12, 512]]),
  mi("Redmi Note 14 Pro 5G", "Redmi", "redmi-note-14-pro-5g", [[8, 256], [12, 256], [12, 512]]),
  mi("Redmi Note 14 Pro+ 5G", "Redmi", "redmi-note-14-pro-plus-5g", [[8, 256], [12, 256], [12, 512]]),
  ...[
    "Redmi 9T", "Redmi 10 4G", "Redmi 10 5G", "Redmi 10C", "Redmi 12 4G", "Redmi 12 5G", "Redmi 12C",
    "Redmi Note 10S", "Redmi Note 10 5G", "Redmi Note 10 Pro 4G",
    "Redmi Note 11 4G", "Redmi Note 11S 4G", "Redmi Note 11S 5G",
    "Redmi Note 11 Pro 5G", "Redmi Note 11 Pro+ 5G",
    "Redmi Note 12 4G", "Redmi Note 12 5G", "Redmi Note 12 Pro 5G", "Redmi Note 12 Pro+ 5G",
  ].map((name) => phone(name, "Redmi", xiaomiIndex)),
  phone("Redmi Note 12 Pro 4G", "Redmi", "https://www.mi.com/my/phone/redmi/note-list"),
  phone("Redmi Note 12S", "Redmi", "https://www.mi.com/my/phone/redmi/note-list"),

  mi("POCO X6 5G", "POCO", "poco-x6", [[8, 256], [12, 256], [12, 512]]),
  mi("POCO X6 Pro 5G", "POCO", "poco-x6-pro", [[8, 256], [12, 512]]),
  mi("POCO F6", "POCO", "poco-f6", [[8, 256], [12, 512]]),
  mi("POCO M6 Pro 4G", "POCO", "poco-m6-pro", [[8, 256], [12, 512]]),
  mi("POCO C65", "POCO", "poco-c65", [[6, 128], [8, 256]]),
  phone("POCO F4", "POCO", xiaomiArchive, [[6, 128]]),

  phone("OPPO A38 4G", "OPPO", "https://www.oppo.com/en/smartphones/series-a/a38/specs/", [[4, 128]]),
  phone("OPPO A58 4G", "OPPO", "https://www.oppo.com/en/smartphones/series-a/a58/specs/", [[6, 128]]),
  phone("OPPO A60 4G", "OPPO", "https://www.oppo.com/en/smartphones/series-a/a60/specs/", [[8, 128], [8, 256]]),
  phone("OPPO A78 4G", "OPPO", "https://www.oppo.com/en/smartphones/series-a/a78/specs/", [[8, 128], [8, 256]]),
  phone("OPPO A78 5G", "OPPO", "https://www.oppo.com/en/smartphones/series-a/a78-5g/specs/", [[4, 128], [8, 128]]),
  phone("OPPO Reno12 F 5G", "OPPO", "https://www.oppo.com/en/smartphones/series-reno/reno12-f-5g/specs/", [[8, 256], [12, 256], [12, 512]]),
  ...[
    "OPPO A16", "OPPO A16k", "OPPO A17", "OPPO A17k", "OPPO A57 4G", "OPPO A57s",
    "OPPO A74 5G", "OPPO A76", "OPPO A77 5G", "OPPO A96", "OPPO A98 5G",
    "OPPO Reno7 4G", "OPPO Reno7 5G", "OPPO Reno8 5G", "OPPO Reno8 Pro 5G",
    "OPPO Reno8 T 4G", "OPPO Reno8 T 5G", "OPPO Reno10 5G", "OPPO Reno10 Pro 5G",
    "OPPO Reno11 5G", "OPPO Reno11 Pro 5G", "OPPO Reno12 5G", "OPPO Reno12 Pro 5G",
  ].map((name) => phone(name, "OPPO", oppoIndex)),
  phone("OPPO A54 5G", "OPPO", oppoIndex, [[4, 64]]),
  phone("OPPO A15", "OPPO", oppoIndex, [[2, 32]]),
  phone("OPPO A15s", "OPPO", oppoIndex, [[4, 64]]),

  phone("realme C67 4G", "realme", "https://www.realme.com/lk/realme-c67/specs", [[8, 256]]),
  phone("realme C53 4G", "realme", "https://www.realme.com/global/realme-c53/specs", [[6, 256], [8, 256]]),
  ...["realme C21Y", "realme C35", "realme C55 4G", "realme Note 50", "realme Note 60", "realme GT 6", "realme GT 6T"].map(
    (name) => phone(name, "realme", realmeIndex)),

  phone("OnePlus 12", "OnePlus", "https://www.oneplus.com/si/12/specs", [[12, 256], [16, 512]]),
  phone("OnePlus 12R", "OnePlus", "https://www.oneplus.com/global/12r/specs", [[16, 256]]),
  phone("OnePlus Nord CE4 Lite 5G", "OnePlus", "https://www.oneplus.com/fr/nord-ce4-lite-5g/specs", [[8, 256]]),

  phone("vivo Y03 4G", "vivo", "https://www.vivo.com/en/products/param/y03", [[4, 64], [4, 128]], "none"),
  phone("vivo Y17s 4G", "vivo", "https://www.vivo.com/en/products/param/y17s", [[4, 64], [4, 128], [6, 128]]),
  phone("vivo Y27 4G", "vivo", "https://www.vivo.com/en/products/param/y27", [[6, 128]]),
  phone("vivo V30 5G", "vivo", "https://www.vivo.com/en/products/param/v30", [[12, 256]]),
  phone("vivo Y36 4G", "vivo", "https://www.vivo.com/en/products/param/y36"),
  ...["vivo X200", "vivo X200 Pro", "vivo V50", "vivo Y100 5G", "vivo Y200 5G"].map(
    (name) => phone(name, "vivo", "https://www.vivo.com/en/products")),

  tablet("Xiaomi Pad 5 Wi-Fi", "Xiaomi", "https://www.mi.com/global/product/xiaomi-pad-5/specs/", [[6, 128], [6, 256]]),
  tablet("Xiaomi Pad 6 Wi-Fi", "Xiaomi", "https://www.mi.com/global/product/xiaomi-pad-6/specs/", [[6, 128], [8, 128], [8, 256]]),
  tablet("Xiaomi Pad 7 Wi-Fi", "Xiaomi", "https://www.mi.com/global/product/xiaomi-pad-7/specs/", [[8, 128], [8, 256], [12, 256]]),
  tablet("Xiaomi Pad 7 Pro Wi-Fi", "Xiaomi", "https://www.mi.com/global/product/xiaomi-pad-7-pro/specs/", [[8, 128], [8, 256], [12, 512]]),
  tablet("Redmi Pad Wi-Fi", "Redmi", "https://www.mi.com/global/product/redmi-pad/specs/", [[3, 64], [4, 128], [6, 128]]),
  tablet("Redmi Pad SE 11 Wi-Fi", "Redmi", "https://www.mi.com/global/product/redmi-pad-se/specs/", [[4, 128], [6, 128], [8, 128]]),
  tablet("Redmi Pad Pro Wi-Fi", "Redmi", "https://www.mi.com/global/product/redmi-pad-pro/specs/", [[6, 128], [8, 128], [8, 256]]),
  tablet("Redmi Pad Pro 5G", "Redmi", "https://www.mi.com/global/product/redmi-pad-pro-5g/specs/", [[6, 128], [8, 128], [8, 256]], "cellular"),
  tablet("OnePlus Pad Wi-Fi", "OnePlus", "https://www.oneplus.com/global/oneplus-pad/specs", [[8, 128]]),
  tablet("OnePlus Pad 2 Wi-Fi", "OnePlus", "https://www.oneplus.com/global/oneplus-pad-2/specs"),
  tablet("OPPO Pad Air Wi-Fi", "OPPO", "https://www.oppo.com/en/accessories/oppo-pad-air/specs/", [[4, 64], [4, 128]]),
];
