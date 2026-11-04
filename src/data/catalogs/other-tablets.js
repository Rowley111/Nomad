// Curated manufacturer references, checked 2026-11-04. No market-price seeds.
// Empty configs mean the exact physical-RAM/storage pair still needs confirmation.
const phone = (name, brand, source, configs = [], biometric = "unknown") => ({
  name, brand, deviceType: "phone", connectivity: "phone", biometric,
  configs: configs.map(([storage, ram]) => ({ storage, ram })),
  source, verified: configs.length > 0,
});
const listedPhones = (brand, source, names) => names.map((name) => phone(name, brand, source));
const ipad = (name, capacities, biometric = "fingerprint", esimOnly = false) => [
  { name: name + " Wi-Fi", brand: "Apple", deviceType: "tablet", connectivity: "wifi", biometric,
    configs: capacities.map((storage) => ({ storage, ram: null })),
    simModes: ["wifi"], source: "https://support.apple.com/en-us/108043", verified: true },
  { name: name + " Wi-Fi + Cellular", brand: "Apple", deviceType: "tablet", connectivity: "cellular", biometric,
    configs: capacities.map((storage) => ({ storage, ram: null })),
    ...(esimOnly ? { simModes: ["esim"] } : {}),
    source: "https://support.apple.com/en-us/108043", verified: true },
];
const tablet = (name, brand, source, configs = [], biometric = "unknown") => ({
  name, brand, source, deviceType: "tablet", connectivity: "wifi", biometric,
  configs: configs.map(([storage, ram]) => ({ storage, ram })),
  simModes: ["wifi"], verified: configs.length > 0,
});
const motorolaList = "https://en-us.support.motorola.com/app/answers/detail/a_id/186612/~/android-15-phones";
const honorList = "https://www.honor.com/global/sitemap/";
const huaweiList = "https://consumer.huawei.com/uk/support/content/en-gb15994486/";
const tecnoList = "https://www.tecno-mobile.com/phones/product-compare-list/";

export const otherTabletCatalog = [
  ...listedPhones("Motorola", motorolaList, [
    "Motorola moto g34 5G", "Motorola moto g55 5G", "Motorola moto g64 5G",
    "Motorola moto g75 5G", "Motorola moto g85 5G", "Motorola edge 30 ultra",
    "Motorola edge 40", "Motorola edge 40 neo", "Motorola edge 50 fusion",
    "Motorola edge 50 pro", "Motorola edge 50 ultra", "Motorola razr 40",
    "Motorola razr 50", "Motorola razr 50 ultra",
  ]),
  phone("Motorola moto g54 5G", "Motorola",
    "https://en-us.support.motorola.com/app/answers/detail/a_id/176176/~/moto-g54-5g---technischen-daten", [[256, 8]], "fingerprint"),
  phone("Motorola moto g84 5G", "Motorola", "https://www.motorola.in/smartphones/moto-g-family", [[256, 12]], "fingerprint"),
  ...listedPhones("HONOR", honorList, [
    "HONOR 90", "HONOR 90 Lite", "HONOR 200", "HONOR 200 Pro", "HONOR 200 Lite",
    "HONOR X9b", "HONOR X8b", "HONOR X7b", "HONOR Magic5 Pro", "HONOR Magic6 Pro",
  ]),
  ...listedPhones("Huawei", huaweiList, [
    "Huawei P50 Pro", "Huawei P60", "Huawei P60 Pro", "Huawei nova 11",
    "Huawei nova 11 Pro", "Huawei nova 11i", "Huawei nova 12s",
  ]),
  phone("Huawei nova Y72", "Huawei", "https://consumer.huawei.com/by/phones/nova-y72/specs/"),
  phone("ZTE Blade A35", "ZTE", "https://zteargentina.com.ar/storage/products/custom/product_20250604_150755.pdf", [[64, 2]], "none"),
  phone("ZTE Blade A55", "ZTE", "https://www.ztedevices.com.my/zte/blade-a-series/66b206e83f209-blade-a55"),
  phone("ZTE Blade A75 5G", "ZTE", "https://www.ztedevices.com/en/products/"),
  ...listedPhones("TECNO", tecnoList, [
    "TECNO CAMON 30", "TECNO CAMON 30 Pro 5G", "TECNO CAMON 30 Premier 5G",
    "TECNO CAMON 40", "TECNO CAMON 40 Pro 5G", "TECNO POVA 6",
    "TECNO POVA 6 Pro 5G", "TECNO SPARK 30C", "TECNO SPARK 40", "TECNO SPARK Go 1",
  ]),
  ...listedPhones("Infinix", "https://ng.infinixmobility.com/category/17", [
    "Infinix HOT 40 Pro", "Infinix SMART 8", "Infinix NOTE 40 Pro",
  ]),
  phone("Infinix NOTE 40 Pro 5G", "Infinix", "https://af.infinixmobility.com/smartphones?cId=15&cName=Latest+Product"),
  phone("Nothing Phone (1)", "Nothing", "https://checkout-us.nothing.tech/pages/phone-1"),
  phone("Nothing Phone (2)", "Nothing", "https://checkout-eu.nothing.tech/pages/phone-2", [[128, 8], [256, 12], [512, 12]], "fingerprint"),
  phone("Nothing Phone (2a)", "Nothing", "https://checkout.nothing.tech/pages/phone-2a"),
  phone("Nokia G22", "Nokia", "https://www.hmd.com/en_gb/press/nokia-g-22-best-inventions-by-time"),
  phone("Nokia G42 5G", "Nokia", "https://www.hmd.com/en_in/nokia-g-42/specs"),
  phone("HMD Pulse Pro", "HMD", "https://www.hmd.com/assets/wcfotm6rrl7u/4pk6nBJt06h85KOioYpxNP/d5767e840afe95d3c66c7b5a3ca71438/Ecodesign_product_information_sheet_-_HMD_Pulse_Pro.pdf"),
  phone("Sony Xperia 1 V", "Sony", "https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-1-v-256gb/specifications"),
  phone("Sony Xperia 5 V", "Sony", "https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-5-v-128gb/specifications"),
  phone("Sony Xperia 10 VI", "Sony", "https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-10-vi/specifications"),
  phone("ASUS Zenfone 10", "ASUS", "https://press.asus.com/news/press-releases/asus-unveils-the-mighty-new-zenfone10"),
  phone("ASUS Zenfone 11 Ultra", "ASUS", "https://www.asus.com/au/mobile-handhelds/phones/zenfone/zenfone-11-ultra/techspec/"),
  phone("iPhone SE (2-го поколения)", "Apple", "https://support.apple.com/en-gb/108044", [[64, null], [128, null], [256, null]], "fingerprint"),
  phone("iPhone SE (3-го поколения)", "Apple", "https://support.apple.com/en-gb/108044", [[64, null], [128, null], [256, null]], "fingerprint"),
  ...ipad("iPad (9-го поколения)", [64, 256]),
  ...ipad("iPad (10-го поколения)", [64, 256]),
  ...ipad("iPad (A16)", [128, 256, 512], "fingerprint", true),
  ...ipad("iPad Air (4-го поколения)", [64, 256]),
  ...ipad("iPad Air (5-го поколения)", [64, 256]),
  ...ipad("iPad Air 11 (M2)", [128, 256, 512, 1024], "fingerprint", true),
  ...ipad("iPad Air 13 (M2)", [128, 256, 512, 1024], "fingerprint", true),
  ...ipad("iPad Air 11 (M3)", [128, 256, 512, 1024], "fingerprint", true),
  ...ipad("iPad Air 13 (M3)", [128, 256, 512, 1024], "fingerprint", true),
  ...ipad("iPad mini (6-го поколения)", [64, 256]),
  ...ipad("iPad mini (A17 Pro)", [128, 256, 512], "fingerprint", true),
  ...ipad("iPad Pro 11 (3-го поколения)", [128, 256, 512, 1024, 2048], "faceid"),
  ...ipad("iPad Pro 12.9 (5-го поколения)", [128, 256, 512, 1024, 2048], "faceid"),
  ...ipad("iPad Pro 11 (4-го поколения)", [128, 256, 512, 1024, 2048], "faceid"),
  ...ipad("iPad Pro 12.9 (6-го поколения)", [128, 256, 512, 1024, 2048], "faceid"),
  ...ipad("iPad Pro 11 (M4)", [256, 512, 1024, 2048], "faceid", true),
  ...ipad("iPad Pro 13 (M4)", [256, 512, 1024, 2048], "faceid", true),
  tablet("HONOR Pad 9 Wi-Fi", "HONOR", "https://www.honor.com/global/tablets/honor-pad-9/", [[256, 8]], "none"),
  tablet("HONOR Pad 8 Wi-Fi", "HONOR", honorList),
  tablet("HONOR MagicPad2 Wi-Fi", "HONOR", honorList),
  tablet("Lenovo Tab M11 Wi-Fi", "Lenovo", "https://psref.lenovo.com/product/Lenovo%20Tablets/Tab_M11?tab=spec"),
  tablet("Huawei MatePad 11.5 (2023) Wi-Fi", "Huawei", "https://consumer.huawei.com/jp/support/tablets/matepad-11-5/"),
];
