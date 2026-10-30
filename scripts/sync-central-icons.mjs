import { gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const siteUrl = "https://centralicons.com";
const root = new URL("../", import.meta.url);
const metadataUrl = new URL("metadata/central-icons-source.json", root);
const styleUrls = {
  linear: new URL("icons/linear/", root),
  filled: new URL("icons/filled/", root),
};

const fetchBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const fetchText = async (url) => (await fetchBuffer(url)).toString("utf8");

const decodeString = (value) => JSON.parse(value);

const parseMetadata = (source) => {
  const pattern = /(Icon[A-Za-z0-9]+):\{title:("(?:\\.|[^"\\])*").*?category:("(?:\\.|[^"\\])*").*?createdAt:("(?:\\.|[^"\\])*").*?aliases:("(?:\\.|[^"\\])*")\}/g;
  return [...source.matchAll(pattern)].map((match) => ({
    component: match[1],
    title: decodeString(match[2]),
    category: decodeString(match[3]),
    createdAt: decodeString(match[4]),
    aliases: decodeString(match[5]).split(",").map((alias) => alias.trim()).filter(Boolean),
  }));
};

const parseVariantData = (source) => {
  const xorMatch = source.match(/"variantXorKey",0,\[([^\]]+)\]/);
  if (!xorMatch) throw new Error("Could not find the variant XOR key");
  const xorKey = Uint8Array.from(xorMatch[1].split(",").map(Number));

  const paths = {};
  for (const style of ["round-outlined-radius-2-stroke-2", "round-filled-radius-2-stroke-2"]) {
    const match = source.match(new RegExp(`"${style}":"([^"]+)"`));
    if (!match) throw new Error(`Could not find ${style}`);
    paths[style] = match[1];
  }
  return { xorKey, paths };
};

const decodeVariant = async (path, xorKey) => {
  const encrypted = await fetchBuffer(new URL(path, siteUrl));
  for (let index = 0; index < encrypted.length; index += 1) {
    encrypted[index] ^= xorKey[index % xorKey.length];
  }
  return JSON.parse(gunzipSync(encrypted).toString("utf8"));
};

const wrapSvg = (content) =>
  `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${content}</svg>\n`;

const homepage = await fetchText(`${siteUrl}/`);
const chunkPaths = [...homepage.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((match) => match[1]);
const chunks = await Promise.all([...new Set(chunkPaths)].map((path) => fetchText(new URL(path, siteUrl))));
const dataChunk = chunks.find((chunk) => chunk.includes('"iconMetadata"') && chunk.includes('"variantManifest"'));
if (!dataChunk) throw new Error("Could not find the Central Icons data chunk");

const records = parseMetadata(dataChunk);
const { xorKey, paths } = parseVariantData(dataChunk);
const [linearSvgs, filledSvgs] = await Promise.all([
  decodeVariant(paths["round-outlined-radius-2-stroke-2"], xorKey),
  decodeVariant(paths["round-filled-radius-2-stroke-2"], xorKey),
]);
if (!records.length || records.length !== linearSvgs.length || records.length !== filledSvgs.length) {
  throw new Error(`Mismatched source data: ${records.length} metadata, ${linearSvgs.length} linear, ${filledSvgs.length} filled`);
}

const previous = JSON.parse(await readFile(metadataUrl, "utf8"));
const previousByCanonical = new Map(
  Object.entries(previous.icons).map(([localName, icon]) => [icon.canonicalName.toLowerCase(), localName]),
);
const icons = {};
let added = 0;
let updated = 0;

await Promise.all(Object.values(styleUrls).map((url) => mkdir(url, { recursive: true })));
for (let index = 0; index < records.length; index += 1) {
  const record = records[index];
  const canonicalName = record.aliases[0];
  const localName = previousByCanonical.get(canonicalName.toLowerCase()) ?? canonicalName.toLowerCase();
  const existed = previous.icons[localName] !== undefined;
  if (!existed) added += 1;

  icons[localName] = {
    canonicalName,
    category: record.category,
    aliases: record.aliases,
    createdAt: record.createdAt,
  };

  for (const [style, contents] of [["linear", linearSvgs], ["filled", filledSvgs]]) {
    const url = new URL(`${localName}.svg`, styleUrls[style]);
    const next = wrapSvg(contents[index]);
    let current = null;
    try {
      current = await readFile(url, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current !== next) {
      await writeFile(url, next);
      if (existed) updated += 1;
    }
  }
}

const sortedIcons = Object.fromEntries(Object.entries(icons).sort(([left], [right]) => left.localeCompare(right)));
const syncedAt = new Date().toISOString().slice(0, 10);
await writeFile(metadataUrl, `${JSON.stringify({ source: `${siteUrl}/`, syncedAt, count: records.length, icons: sortedIcons }, null, 2)}\n`);

console.log(`Synced ${records.length} Central Icons (${added} added, ${updated} existing SVG files updated).`);
