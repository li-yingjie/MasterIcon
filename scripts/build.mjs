import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url);
const styles = ["filled", "linear"];
const iconRoot = new URL("icons/", root);
const metadataRoot = new URL("metadata/", root);
const distRoot = new URL("dist/", root);
const reactRoot = new URL("dist/react/", root);

const styleSuffix = {
  filled: "Filled",
  linear: "Linear"
};

const toPascalCase = (value) => {
  const parts = value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  const name = parts.join("");
  return /^[0-9]/.test(name) ? `Icon${name}` : name;
};

const componentName = (name, style) => `${toPascalCase(name)}${styleSuffix[style]}Icon`;

const tagsFor = (name) => Array.from(new Set(name.split(/[-_]+/).filter(Boolean)));

const svgInner = (svg, filePath) => {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>\s*$/);
  if (!match) {
    throw new Error(`Invalid SVG wrapper: ${filePath}`);
  }
  return match[1];
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const readIcons = async () => {
  const byName = new Map();
  const duplicateMap = new Map();

  for (const style of styles) {
    const dir = new URL(`${style}/`, iconRoot);
    const files = (await readdir(dir)).filter((file) => file.endsWith(".svg")).sort();

    for (const file of files) {
      const name = file.replace(/\.svg$/, "");
      const fileUrl = new URL(file, dir);
      const svg = await readFile(fileUrl, "utf8");
      const relativePath = path.posix.join("icons", style, file);
      const hash = sha256(svg);

      if (!byName.has(name)) {
        byName.set(name, {
          name,
          category: "general",
          tags: tagsFor(name),
          styles: [],
          files: {},
          components: {}
        });
      }

      const record = byName.get(name);
      record.styles.push(style);
      record.files[style] = relativePath;
      record.components[style] = componentName(name, style);

      if (!duplicateMap.has(hash)) {
        duplicateMap.set(hash, []);
      }
      duplicateMap.get(hash).push(relativePath);
    }
  }

  const icons = Array.from(byName.values())
    .map((record) => ({
      ...record,
      styles: styles.filter((style) => record.styles.includes(style))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const duplicates = Array.from(duplicateMap.entries())
    .filter(([, files]) => files.length > 1)
    .map(([hash, files]) => ({ hash, files: files.sort() }))
    .sort((a, b) => b.files.length - a.files.length || a.files[0].localeCompare(b.files[0]));

  return { icons, duplicates };
};

const writeMetadata = async (icons, duplicates) => {
  await mkdir(metadataRoot, { recursive: true });

  const legacyMap = {};
  for (const icon of icons) {
    for (const style of icon.styles) {
      legacyMap[`${icon.name}-${style}.svg`] = icon.files[style];
    }
  }

  await writeFile(new URL("icons.json", metadataRoot), `${JSON.stringify(icons, null, 2)}\n`);
  await writeFile(new URL("duplicates.json", metadataRoot), `${JSON.stringify(duplicates, null, 2)}\n`);
  await writeFile(new URL("legacy-map.json", metadataRoot), `${JSON.stringify(legacyMap, null, 2)}\n`);
};

const writeMetadataModule = async (icons) => {
  await mkdir(distRoot, { recursive: true });

  await writeFile(
    new URL("metadata.js", distRoot),
    `const icons = ${JSON.stringify(icons, null, 2)};

export default icons;
export { icons };
`
  );

  await writeFile(
    new URL("metadata.d.ts", distRoot),
    `export interface IconMetadata {
  name: string;
  category: string;
  tags: string[];
  styles: Array<"filled" | "linear">;
  files: Partial<Record<"filled" | "linear", string>>;
  components: Partial<Record<"filled" | "linear", string>>;
}

declare const icons: IconMetadata[];
export default icons;
export { icons };
`
  );
};

const writeReactRuntime = async () => {
  await mkdir(reactRoot, { recursive: true });

  await writeFile(
    new URL("createIcon.js", reactRoot),
    `import * as React from "react";

export function createIcon(displayName, innerSvg) {
  const Icon = React.forwardRef(function MasterIcon(
    { title, titleId, size, ...props },
    ref
  ) {
    const generatedTitleId = React.useId();
    const resolvedTitleId = title ? titleId ?? generatedTitleId : undefined;

    return React.createElement(
      "svg",
      {
        width: size ?? 24,
        height: size ?? 24,
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": title ? undefined : true,
        role: title ? "img" : undefined,
        "aria-labelledby": resolvedTitleId,
        ...props,
        ref
      },
      title ? React.createElement("title", { id: resolvedTitleId }, title) : null,
      React.createElement("g", {
        dangerouslySetInnerHTML: { __html: innerSvg }
      })
    );
  });

  Icon.displayName = displayName;
  return Icon;
}
`
  );

  await writeFile(
    new URL("types.d.ts", reactRoot),
    `import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  title?: string;
  titleId?: string;
  size?: number | string;
}

export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;
`
  );

  await writeFile(
    new URL("createIcon.d.ts", reactRoot),
    `import type { IconComponent } from "./types.js";

export declare function createIcon(displayName: string, innerSvg: string): IconComponent;
`
  );
};

const writeReactComponents = async (icons) => {
  await rm(reactRoot, { recursive: true, force: true });
  await writeReactRuntime();

  const exportLines = [
    `export type { IconComponent, IconProps } from "./types.js";`,
    `export { createIcon } from "./createIcon.js";`
  ];
  const componentNames = new Set();

  for (const icon of icons) {
    for (const style of icon.styles) {
      const name = icon.components[style];
      if (componentNames.has(name)) {
        throw new Error(`Component name collision: ${name}`);
      }
      componentNames.add(name);

      const svgPath = new URL(`${style}/${icon.name}.svg`, iconRoot);
      const svg = await readFile(svgPath, "utf8");
      const inner = svgInner(svg, icon.files[style]);

      await writeFile(
        new URL(`${name}.js`, reactRoot),
        `import { createIcon } from "./createIcon.js";

export const ${name} = createIcon(${JSON.stringify(name)}, ${JSON.stringify(inner)});
export default ${name};
`
      );

      await writeFile(
        new URL(`${name}.d.ts`, reactRoot),
        `import type { IconComponent } from "./types.js";

export declare const ${name}: IconComponent;
export default ${name};
`
      );

      exportLines.push(`export { default as ${name}, ${name} } from "./${name}.js";`);
    }
  }

  await writeFile(new URL("index.js", reactRoot), `${exportLines.join("\n")}\n`);
  await writeFile(new URL("index.d.ts", reactRoot), `${exportLines.join("\n")}\n`);
};

const { icons, duplicates } = await readIcons();
await writeMetadata(icons, duplicates);
await writeMetadataModule(icons);
await writeReactComponents(icons);

console.log(`Built ${icons.length} icons across ${styles.length} styles.`);
console.log(`Generated ${icons.length * styles.length} React component entries.`);
console.log(`Found ${duplicates.length} duplicate SVG groups.`);
