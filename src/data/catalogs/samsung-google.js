// Manufacturer-backed catalogue data, checked 2026-11-04. No price data.
// Empty configs intentionally mean that the physical memory needs confirmation.
const samsungA = "https://developer.samsung.com/galaxy-emulator-skin/galaxy-a.html";
const samsungS = "https://developer.samsung.com/galaxy-emulator-skin/galaxy-s.html";
const samsungZ = "https://developer.samsung.com/galaxy-emulator-skin/galaxy-z.html";
const samsungTab = "https://developer.samsung.com/galaxy-emulator-skin/galaxy-tab.html";
const a2025 = "https://news.samsung.com/global/samsung-marks-a-step-forward-with-ai-for-everyone-by-introducing-new-galaxy-a56-5g-galaxy-a36-5g-and-galaxy-a26-5g";
const a2024 = "https://news.samsung.com/global/samsung-galaxy-a55-5g-and-galaxy-a35-5g-awesome-innovations-and-security-engineered-for-everyone";
const a15 = "https://news.samsung.com/in/samsung-galaxy-a25-5g-galaxy-a15-5g-with-awesome-camera-and-new-editing-features-launched-in-india";
const s22 = "https://www.samsung.com/us/support/answer/ANS10003652/";
const s23 = "https://www.samsungmobilepress.com/articles/take-your-passions-further-with-the-new-samsung-galaxy-s23-series-designed-for-a-premium-experience-today-and-beyond";
const s24 = "https://www.samsung.com/us/support/answer/ANS10000756/";
const s25 = "https://news.samsung.com/global/samsung-galaxy-s25-series-sets-the-standard-of-ai-phone-as-a-true-ai-companion";
const s20fe = "https://www.samsungmobilepress.com/articles/unveiling-samsung-galaxy-s20-fe-fan-favorite-features-at-an-accessible-price-point";
const fe = "https://www.samsungmobilepress.com/articles/samsung-galaxy-s23-fe-galaxy-tab-s9-fe-and-galaxy-buds-fe-bring-standout-features-to-even-more-users";
const tabA9 = "https://news.samsung.com/global/samsung-galaxy-tab-a9-and-galaxy-tab-a9-entertainment-and-productivity-engineered-for-everyone";
const tabS9 = "https://news.samsung.com/global/samsung-galaxy-tab-s9-sets-the-new-standard-to-bring-galaxys-premium-experience-to-a-tablet";
const pixelSource = "https://support.google.com/pixelphone/answer/7158570?hl=en";
const configs = (pairs) => pairs.map(([storage, ram]) => ({ storage, ram }));
const samsung = (suffix, source, pairs = [], extra = {}) => ({
  name: "Samsung Galaxy " + suffix,
  brand: "Samsung",
  deviceType: "phone",
  connectivity: "phone",
  biometric: "unknown",
  configs: configs(pairs),
  source,
  verified: pairs.length > 0,
  ...extra,
});
const tablet = (suffix, connection, source, pairs = []) => samsung(
  "Tab " + suffix + (connection === "wifi" ? " Wi-Fi" : suffix === "A9" ? " LTE" : " 5G"),
  source, pairs, { deviceType: "tablet", connectivity: connection,
    biometric: source === tabS9 ? "fingerprint" : "unknown" },
);
const pixel = (suffix, ram, storage) => ({
  name: "Google Pixel " + suffix,
  brand: "Google",
  deviceType: "phone",
  connectivity: "phone",
  biometric: "fingerprint",
  configs: storage.map((storage) => ({ storage, ram })),
  source: pixelSource,
  verified: true,
});

export const samsungGoogleCatalog = [
  samsung("A03s", samsungA),
  samsung("A04", samsungA),
  samsung("A05", samsungA),
  samsung("A05s", samsungA),
  samsung("A06 4G", "https://news.samsung.com/br/samsung-apresenta-galaxy-a06-no-brasil"),
  samsung("A06 5G", "https://www.samsung.com/sg/smartphones/galaxy-a/galaxy-a06-5g-light-gray-128gb-sm-a066bzahxsp/"),
  samsung("A13 5G", samsungA),
  samsung("A14 4G", "https://www.samsung.com/ph/smartphones/galaxy-a/galaxy-a14-silver-128gb-sm-a145fzsvphl/", [[64, 4], [128, 4]]),
  samsung("A14 5G", samsungA),
  samsung("A15 4G", "https://news.samsung.com/sg/all-around-awesome-with-the-latest-galaxy-a25-and-galaxy-a15-now-available-in-singapore"),
  samsung("A15 5G", a15, [[128, 8], [256, 8]]),
  samsung("A16 5G", samsungA),
  samsung("A17 4G", "https://shop.samsung.com/latin/cac/gt/galaxy-a17-lte-4gb-128gb.html", [[128, 4]]),
  samsung("A17 5G", samsungA),
  samsung("A21s", "https://news.samsung.com/pl/galaxy-a21s-nowy-czlonek-rodziny-samsung-galaxy-a"),
  samsung("A23 5G", samsungA),
  samsung("A24 4G", samsungA),
  samsung("A25 5G", a15, [[128, 8], [256, 8]]),
  samsung("A26 5G", a2025, [[128, 6], [128, 8], [256, 8]]),
  samsung("A32 4G", "https://www.samsung.com/pl/support/mobile-devices/jakie-sa-roznice-miedzy-smartfonami-z-serii-galaxy-a/"),
  samsung("A32 5G", "https://news.samsung.com/ca/samsung-galaxy-a52-5g-and-galaxy-a32-5g-make-innovation-accessible-to-all"),
  samsung("A33 5G", samsungA),
  samsung("A34 5G", samsungA),
  samsung("A35 5G", a2024, [[128, 6], [128, 8], [256, 8]]),
  samsung("A36 5G", a2025, [[128, 6], [128, 8], [256, 8], [256, 12]]),
  samsung("A50", "https://www.samsung.com/us/business/support/owners/product/galaxy-a50-verizon/"),
  samsung("A52 4G", "https://www.samsung.com/pl/support/mobile-devices/jakie-sa-roznice-miedzy-smartfonami-z-serii-galaxy-a/"),
  samsung("A52 5G", "https://news.samsung.com/ca/samsung-galaxy-a52-5g-and-galaxy-a32-5g-make-innovation-accessible-to-all"),
  samsung("A52s 5G", samsungA),
  samsung("A53 5G", samsungA),
  samsung("A54 5G", samsungA),
  samsung("A55 5G", a2024, [[128, 8], [256, 8], [256, 12]]),
  samsung("A56 5G", a2025, [[128, 8], [256, 8], [256, 12]]),

  samsung("S9", samsungS),
  samsung("S9+", samsungS),
  samsung("S10e", samsungS),
  samsung("S10", samsungS),
  samsung("S10+", samsungS),
  samsung("S20 4G", samsungS),
  samsung("S20+ 4G", samsungS),
  samsung("S20 Ultra 5G", samsungS),
  samsung("S20 FE 4G", s20fe, [[128, 6], [128, 8], [256, 8]]),
  samsung("S20 FE 5G", s20fe, [[128, 6], [128, 8], [256, 8]]),
  samsung("S21", samsungS),
  samsung("S21+", samsungS),
  samsung("S21 Ultra", samsungS),
  samsung("S21 FE 5G", samsungS),
  samsung("S22", s22, [[128, 8], [256, 8]]),
  samsung("S22+", s22, [[128, 8], [256, 8]]),
  samsung("S22 Ultra", s22, [[128, 8], [256, 12], [512, 12], [1024, 12]]),
  samsung("S23", s23, [[128, 8], [256, 8]]),
  samsung("S23+", s23, [[256, 8], [512, 8]]),
  samsung("S23 Ultra", s23, [[256, 8], [256, 12], [512, 12], [1024, 12]]),
  samsung("S23 FE", fe, [[128, 8], [256, 8]]),
  samsung("S24", s24, [[128, 8], [256, 8]]),
  samsung("S24+", s24, [[256, 12], [512, 12]]),
  samsung("S24 Ultra", s24, [[256, 12], [512, 12], [1024, 12]]),
  samsung("S24 FE", s24, [[128, 8], [256, 8], [512, 8]]),
  samsung("S25", s25, [[128, 12], [256, 12], [512, 12]]),
  samsung("S25+", s25, [[256, 12], [512, 12]]),
  samsung("S25 Ultra", s25, [[256, 12], [512, 12], [1024, 12]]),

  ...["Z Fold3", "Z Fold4", "Z Fold5", "Z Fold6", "Z Flip3", "Z Flip4", "Z Flip5", "Z Flip6"]
    .map((name) => samsung(name, samsungZ)),

  pixel("6", 8, [128, 256]),
  pixel("6 Pro", 12, [128, 256, 512]),
  pixel("6a", 6, [128]),
  pixel("7", 8, [128, 256]),
  pixel("7 Pro", 12, [128, 256, 512]),
  pixel("7a", 8, [128]),
  pixel("8", 8, [128, 256]),
  pixel("8 Pro", 12, [128, 256, 512, 1024]),
  pixel("8a", 8, [128, 256]),
  pixel("9", 12, [128, 256]),
  pixel("9 Pro", 16, [128, 256, 512, 1024]),
  pixel("9 Pro XL", 16, [128, 256, 512, 1024]),
  pixel("9 Pro Fold", 16, [256, 512]),
  pixel("9a", 8, [128, 256]),
  pixel("Fold", 12, [256, 512]),

  // Wi-Fi and cellular versions are separate catalogue models, not surcharges.
  tablet("A9", "wifi", tabA9, [[64, 4], [128, 8]]),
  tablet("A9", "cellular", tabA9, [[64, 4], [128, 8]]),
  tablet("A9+", "wifi", tabA9, [[64, 4], [128, 8]]),
  tablet("A9+", "cellular", tabA9, [[64, 4], [128, 8]]),
  tablet("S9", "wifi", tabS9, [[128, 8], [256, 12]]),
  tablet("S9", "cellular", tabS9, [[128, 8], [256, 12]]),
  tablet("S9+", "wifi", tabS9, [[256, 12], [512, 12]]),
  tablet("S9+", "cellular", tabS9, [[256, 12], [512, 12]]),
  tablet("S9 Ultra", "wifi", tabS9, [[256, 12], [512, 12], [1024, 16]]),
  tablet("S9 Ultra", "cellular", tabS9, [[256, 12], [512, 12], [1024, 16]]),
  tablet("S9 FE", "wifi", fe, [[128, 6], [256, 8]]),
  tablet("S9 FE", "cellular", fe, [[128, 6], [256, 8]]),
  tablet("S9 FE+", "wifi", fe, [[128, 8], [256, 12]]),
  tablet("S9 FE+", "cellular", fe, [[128, 8], [256, 12]]),
  tablet("S8", "wifi", samsungTab),
  tablet("S8+", "wifi", samsungTab),
];
