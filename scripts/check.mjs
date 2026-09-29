import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url);
const styles = ["filled", "linear"];
const iconRoot = new URL("icons/", root);

const errors = [];

const fileExists = async (url) => {
  try {
    await stat(url);
    return true;
  } catch {
    return false;
  }
};

const readStyleNames = async (style) => {
  const dir = new URL(`${style}/`, iconRoot);
  return (await readdir(dir))
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.replace(/\.svg$/, ""))
    .sort();
};

const flatSvgFiles = (await readdir(root)).filter((file) => file.endsWith(".svg"));
if (flatSvgFiles.length > 0) {
  errors.push(`Root directory still contains flat SVG files: ${flatSvgFiles.slice(0, 5).join(", ")}`);
}

const namesByStyle = new Map();
for (const style of styles) {
  namesByStyle.set(style, await readStyleNames(style));
}

const [filled, linear] = styles.map((style) => namesByStyle.get(style));
const filledOnly = filled.filter((name) => !linear.includes(name));

if (filledOnly.length > 0) {
  errors.push(`Missing linear variants for: ${filledOnly.slice(0, 10).join(", ")}`);
}

for (const style of styles) {
  for (const name of namesByStyle.get(style)) {
    const file = new URL(`${style}/${name}.svg`, iconRoot);
    const relativePath = path.posix.join("icons", style, `${name}.svg`);
    const svg = await readFile(file, "utf8");

    if (!svg.includes('viewBox="0 0 24 24"')) {
      errors.push(`${relativePath} is missing viewBox="0 0 24 24"`);
    }

    if (!svg.includes("currentColor")) {
      errors.push(`${relativePath} does not use currentColor`);
    }

    if (!svg.includes('aria-hidden="true"')) {
      errors.push(`${relativePath} is missing aria-hidden="true"`);
    }
  }
}

const metadataExists = await fileExists(new URL("metadata/icons.json", root));
if (!metadataExists) {
  errors.push("metadata/icons.json has not been generated. Run npm run build.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Checked ${filled.length + linear.length} SVG files.`);
console.log(`All icons are 24px, currentColor-based, and metadata is present.`);
