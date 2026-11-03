// Run with a private input file and private output path; never prints the URL/key.
// node scripts/create-owner-setup.mjs /private/guide.json /private/setup-link.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes, webcrypto } from "node:crypto";
import { resolve, dirname, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { previewGuide } from "../src/domain/guide.js";
import { catalogDefaults } from "../src/domain/catalog.js";
import { validatePrice } from "../src/domain/imports.js";
const [input, privateOutput] = process.argv.slice(2);
if (!input || !privateOutput)
  throw new Error("Укажите приватный входной JSON и путь приватной ссылки");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateRelative = relative(root, resolve(privateOutput));
if (
  !privateRelative ||
  (!privateRelative.startsWith(".." + sep) && !isAbsolute(privateRelative))
)
  throw new Error("Ссылку с ключом нужно хранить вне репозитория");
const data = JSON.parse(await readFile(input, "utf8"));
const checked = previewGuide(data, catalogDefaults);
for (const row of checked.valid) validatePrice(row, catalogDefaults);
if (!checked.valid.length) throw new Error("Нет подтверждённых конфигураций");
const guide = {
  format: data.format,
  version: data.version,
  documentDate: data.documentDate,
  sourceName: data.sourceName,
  entries: data.entries,
};
const id = randomBytes(16).toString("hex"),
  keyBytes = randomBytes(32),
  iv = randomBytes(12);
const key = await webcrypto.subtle.importKey(
  "raw",
  keyBytes,
  "AES-GCM",
  false,
  ["encrypt"],
);
const ciphertext = await webcrypto.subtle.encrypt(
  {
    name: "AES-GCM",
    iv,
    additionalData: new TextEncoder().encode("nomad-owner-setup:v1:" + id),
  },
  key,
  new TextEncoder().encode(JSON.stringify(guide)),
);
const envelope = {
  version: 1,
  algorithm: "AES-256-GCM",
  iv: iv.toString("base64url"),
  ciphertext: Buffer.from(ciphertext).toString("base64url"),
};
const serialized = JSON.stringify(envelope) + "\n";
if (Buffer.byteLength(serialized) > 400000)
  throw new Error("Справочник слишком большой для ссылки настройки");
const directory = resolve(root, "public/setup");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, id + ".json"), serialized);
await writeFile(
  privateOutput,
  JSON.stringify({
    id,
    key: keyBytes.toString("base64url"),
    url:
      "https://nomad-a027.onrender.com/#nomad-setup=" +
      id +
      "." +
      keyBytes.toString("base64url"),
  }) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    id,
    ready: checked.valid.length,
    pending: checked.pending.length,
    encrypted: true,
  }),
);
