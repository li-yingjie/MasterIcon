import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceDir = process.argv[2];
if (!sourceDir) {
  throw new Error("Usage: node scripts/import-hugeicons.mjs <core-free-icons/dist/esm>");
}

const outputDir = new URL("../icons/linear/", import.meta.url);
const sourcePackage = new URL("../../package.json", pathToFileURL(`${path.resolve(sourceDir)}/`));
const packageJson = JSON.parse(await readFile(sourcePackage, "utf8"));

const nameAliases = {
  Calendar1Icon: "calendar1"
};

const toKebabCase = (value) =>
  nameAliases[value] ?? value
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d+)/g, "$1-$2")
    .replace(/(\d+)([A-Za-z])/g, "$1-$2")
    .toLowerCase();

const attributeNames = {
  className: "class",
  fillRule: "fill-rule",
  clipRule: "clip-rule",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeOpacity: "stroke-opacity",
  fillOpacity: "fill-opacity"
};

const escapeAttribute = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const serializeNode = ([tag, attributes]) => {
  const normalizedAttributes =
    attributes.stroke && attributes.strokeWidth == null
      ? { ...attributes, strokeWidth: "2" }
      : attributes;
  const serialized = Object.entries(normalizedAttributes)
    .filter(([name]) => name !== "key")
    .map(([name, value]) => {
      const attribute = attributeNames[name] ?? name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const normalized = attribute === "stroke-width" ? "2" : value;
      return `${attribute}="${escapeAttribute(normalized)}"`;
    })
    .join(" ");
  return `  <${tag}${serialized ? ` ${serialized}` : ""} />`;
};

await mkdir(outputDir, { recursive: true });

const files = (await readdir(sourceDir))
  .filter((file) => file.endsWith("Icon.js") && file !== "index.js")
  .sort();

const seenNames = new Map();
const imported = [];

for (const file of files) {
  const name = toKebabCase(file.replace(/\.js$/, ""));
  if (seenNames.has(name)) {
    throw new Error(`Filename collision: ${file} and ${seenNames.get(name)} both map to ${name}.svg`);
  }
  seenNames.set(name, file);

  const module = await import(pathToFileURL(path.join(sourceDir, file)));
  const nodes = module.default;
  if (!Array.isArray(nodes)) {
    throw new Error(`Unexpected icon payload in ${file}`);
  }

  const svg = [
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    ...nodes.map(serializeNode),
    "</svg>",
    ""
  ].join("\n");

  await writeFile(new URL(`${name}.svg`, outputDir), svg);
  imported.push(name);
}

await writeFile(
  new URL("../metadata/hugeicons-source.json", import.meta.url),
  `${JSON.stringify(
    {
      package: packageJson.name,
      version: packageJson.version,
      license: packageJson.license,
      style: "Stroke Rounded",
      size: 24,
      strokeWidth: 2,
      count: imported.length,
      icons: imported
    },
    null,
    2
  )}\n`
);

console.log(`Imported ${imported.length} Hugeicons SVGs at 24px with 2px strokes.`);
