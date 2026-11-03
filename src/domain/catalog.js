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
  note: "Небольшие следы от чехла",
};
export function changeModel(input, model, catalog) {
  const config = catalog.find((x) => x.name === model)?.configs[0];
  return {
    ...input,
    model,
    storage: config?.storage ?? "",
    ram: config?.ram ?? null,
    sim: model === "iPhone Air" ? "esim" : "physical",
    checks: {
      sensor: "unknown",
      cameras: "unknown",
      network: "unknown",
      charging: "unknown",
      ...(model.startsWith("iPhone") ? { faceid: "unknown" } : {}),
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
