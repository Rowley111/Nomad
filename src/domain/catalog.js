import { samsungGoogleCatalog } from "../data/catalogs/samsung-google.js";
import { xiaomiBbkCatalog } from "../data/catalogs/xiaomi-bbk.js";
import { otherTabletCatalog } from "../data/catalogs/other-tablets.js";
const appleSource = "https://support.apple.com/en-gb/108044";
const apple = [
  ["11", [64, 128, 256]],
  ["11 Pro", [64, 256, 512]],
  ["11 Pro Max", [64, 256, 512]],
  ["12 mini", [64, 128, 256]],
  ["12", [64, 128, 256]],
  ["12 Pro", [128, 256, 512]],
  ["12 Pro Max", [128, 256, 512]],
  ["13 mini", [128, 256, 512]],
  ["13", [128, 256, 512]],
  ["13 Pro", [128, 256, 512, 1024]],
  ["13 Pro Max", [128, 256, 512, 1024]],
  ["14", [128, 256, 512]],
  ["14 Plus", [128, 256, 512]],
  ["14 Pro", [128, 256, 512, 1024]],
  ["14 Pro Max", [128, 256, 512, 1024]],
  ["15", [128, 256, 512]],
  ["15 Plus", [128, 256, 512]],
  ["15 Pro", [128, 256, 512, 1024]],
  ["15 Pro Max", [256, 512, 1024]],
  ["16", [128, 256, 512]],
  ["16 Plus", [128, 256, 512]],
  ["16 Pro", [128, 256, 512, 1024]],
  ["16 Pro Max", [256, 512, 1024]],
  ["17", [256, 512]],
  ["17 Pro", [256, 512, 1024]],
  ["17 Pro Max", [256, 512, 1024, 2048]],
  ["Air", [256, 512, 1024]],
];
export const catalogDefaults = apple
  .map(([name, storage]) => ({
    name: "iPhone " + name,
    brand: "Apple",
    configs: storage.map((storage) => ({ storage, ram: null })),
    source: appleSource,
    verified: true,
  }))
  .concat([
    {
      name: "Samsung Galaxy A35 5G",
      brand: "Samsung",
      configs: [{ storage: 128, ram: 8 }],
      source: "Конфигурация владельца, проверить маркировку устройства",
      verified: false,
    },
    ...[
      "Samsung Galaxy A14",
      "Samsung Galaxy A17",
      "Samsung Galaxy A21s",
      "Samsung Galaxy S9",
      "Redmi Note 13",
      "Redmi 10 2022",
      "Redmi A5",
      "Huawei nova Y63",
      "ZTE Blade A36",
      "TECNO Spark Go 2",
    ].map((name) => ({
      name,
      brand: name.split(" ")[0],
      configs: [],
      source:
        "Требуется подтверждение модификации (4G/5G) и физической ОЗУ администратором",
      verified: false,
    })),
  ]);
export const initialInput = {
  model: "Samsung Galaxy A35 5G",
  storage: 128,
  ram: 8,
  sim: "physical",
  screen: "good",
  body: "good",
  battery: "",
  cycles: "",
  box: true,
  charger: false,
  accessories: "",
  repairHistory: "unknown",
  parts: "",
  checks: {
    sensor: "unknown",
    cameras: "unknown",
    network: "unknown",
    charging: "unknown",
  },
  defects: [],
  locks: "unknown",
  repair: 0,
  expenses: 0,
  ask: "",
  scenario: "asis",
  note: "",
};
export function deviceProfile(model, catalog = catalogDefaults) {
  const record = typeof model === "string" ? catalog.find((row) => row.name === model) : model;
  const name = typeof model === "string" ? model : model?.name ?? "";
  const wifi = record?.connectivity === "wifi";
  return {
    deviceType: record?.deviceType ?? "phone",
    connectivity: record?.connectivity ?? "phone",
    faceid: record?.biometric === "faceid" || (record?.biometric == null && name.startsWith("iPhone") && !name.includes("SE")),
    simModes: wifi ? ["wifi"] : record?.simModes ?? (name === "iPhone Air" ? ["esim"] : ["physical", "esim", "other"]),
  };
}
export function changeModel(input, model, catalog) {
  const config = catalog.find((x) => x.name === model)?.configs[0];
  const profile = deviceProfile(model, catalog);
  return {
    ...input,
    model,
    battery: "",
    cycles: "",
    repairHistory: "unknown",
    parts: "",
    locks: "unknown",
    defects: [],
    repair: 0,
    expenses: 0,
    ask: "",
    note: "",
    storage: config?.storage ?? "",
    ram: config?.ram ?? null,
    sim: profile.simModes[0],
    checks: {
      sensor: "unknown",
      cameras: "unknown",
      network: "unknown",
      charging: "unknown",
      ...(profile.faceid ? { faceid: "unknown" } : {}),
    },
  };
}

// Only configurations supported by the linked manufacturer page are enabled.
const confirmed = {
  "Samsung Galaxy S9": {
    configs: [
      { storage: 64, ram: 4 },
      { storage: 128, ram: 4 },
      { storage: 256, ram: 4 },
    ],
    source:
      "https://www.samsungmobilepress.com/media-assets/galaxy_s9?tab=specs",
  },
  "Samsung Galaxy A21s": {
    configs: [{ storage: 64, ram: 4 }],
    source:
      "https://news.samsung.com/cl/samsung-incorpora-galaxy-a21s-a-la-familia-galaxy-a/1000",
  },
  "Redmi A5": {
    configs: [
      { storage: 64, ram: 3 },
      { storage: 128, ram: 4 },
    ],
    source: "https://www.mi.com/ph/product/redmi-a5/specs/",
  },
  "TECNO Spark Go 2": {
    configs: [{ storage: 64, ram: 3 }],
    source:
      "https://www.tecno-mobile.com/om-en/phones/tech-specs/techspecs/spark-go-2/",
  },
  "Redmi Note 13": {
    name: "Redmi Note 13 4G",
    configs: [
      { storage: 128, ram: 6 },
      { storage: 128, ram: 8 },
      { storage: 256, ram: 8 },
    ],
    source: "https://www.mi.com/my/product/redmi-note-13/specs/",
  },
};
for (const model of catalogDefaults) {
  if (confirmed[model.name])
    Object.assign(model, confirmed[model.name], { verified: true });
}

// Exact additional variants checked against manufacturer documentation.
const guideCatalogAdditions = [
  {
    name: "Samsung Galaxy A14 4G",
    brand: "Samsung",
    configs: [
      { storage: 64, ram: 4 },
      { storage: 128, ram: 4 },
    ],
    source:
      "https://www.samsung.com/ph/smartphones/galaxy-a/galaxy-a14-silver-128gb-sm-a145fzsvphl/",
    verified: true,
  },
  {
    name: "Samsung Galaxy A35 5G",
    brand: "Samsung",
    configs: [{ storage: 256, ram: 8 }],
    source:
      "https://news.samsung.com/br/samsung-galaxy-a55-5g-e-galaxy-a35-5g-inovacoes-incriveis-e-seguranca-projetada-para-todos",
    verified: true,
  },
  {
    name: "Samsung Galaxy A21s",
    brand: "Samsung",
    configs: [{ storage: 32, ram: 3 }],
    source:
      "https://news.samsung.com/pl/galaxy-a21s-nowy-czlonek-rodziny-samsung-galaxy-a",
    verified: true,
  },
  {
    name: "Samsung Galaxy A41",
    brand: "Samsung",
    configs: [{ storage: 64, ram: 4 }],
    source:
      "https://news.samsung.com/uk/samsung-announces-the-new-additions-to-a-series-smartphone-lineup-galaxy-a71-5g-galaxy-a51-5g-and-galaxy-a41",
    verified: true,
  },
  {
    name: "Samsung Galaxy A50",
    brand: "Samsung",
    configs: [{ storage: 64, ram: 4 }],
    source:
      "https://www.samsung.com/us/business/support/owners/product/galaxy-a50-verizon/",
    verified: true,
  },
  {
    name: "Redmi 10 2022",
    brand: "Redmi",
    configs: [
      { storage: 64, ram: 4 },
      { storage: 128, ram: 4 },
    ],
    source: "https://www.mi.com/ng/product/redmi-10-2022/specs/",
    verified: true,
  },
  {
    name: "Redmi 15 4G",
    brand: "Redmi",
    configs: [{ storage: 256, ram: 8 }],
    source: "https://www.mi.com/global/product/redmi-15/specs/",
    verified: true,
  },
];
export function catalogForGuide(existing) {
  const catalog = structuredClone(existing);
  for (const addition of guideCatalogAdditions) {
    const model = catalog.find((m) => m.name === addition.name);
    if (!model) {
      catalog.push(structuredClone(addition));
      continue;
    }
    for (const c of addition.configs)
      if (
        !model.configs.some((x) => x.storage === c.storage && x.ram === c.ram)
      )
        model.configs.push({ ...c });
  }
  return catalog;
}
const extended = catalogForGuide(catalogDefaults);
catalogDefaults.splice(0, catalogDefaults.length, ...extended);

// Device references contain no prices. Missing configurations stay unavailable
// until a staff member confirms the exact physical memory on the device.
const byName = new Map(catalogDefaults.map((row) => [row.name.toLocaleLowerCase("ru-RU"), row]));
for (const addition of [...samsungGoogleCatalog, ...xiaomiBbkCatalog, ...otherTabletCatalog]) {
  const key = addition.name.toLocaleLowerCase("ru-RU");
  const previous = byName.get(key);
  if (!previous) {
    const row = structuredClone(addition); catalogDefaults.push(row); byName.set(key, row);
  } else {
    for (const config of addition.configs)
      if (!previous.configs.some((x) => x.storage === config.storage && x.ram === config.ram))
        previous.configs.push({ ...config });
    for (const field of ["deviceType", "connectivity", "biometric", "simModes"])
      if (previous[field] === undefined && addition[field] !== undefined)
        previous[field] = structuredClone(addition[field]);
  }
}
for (const model of catalogDefaults) {
  model.deviceType ??= "phone";
  model.connectivity ??= "phone";
  model.biometric ??= model.name.startsWith("iPhone") ? "faceid" : "unknown";
}
