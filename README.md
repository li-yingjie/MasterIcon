# Master Icon

Master Icon is a 24px SVG icon library with two visual styles:

- `filled`
- `linear`

The source SVG files are organized for direct asset imports, and the build script generates React components plus machine-readable metadata.

## Install

From GitHub:

```bash
npm install github:li-yingjie/MasterIcon
```

If you publish it to npm later:

```bash
npm install master-icon
```

## Usage

### React

```tsx
import { AddImageLinearIcon } from "master-icon/react";

export function UploadButton() {
  return <AddImageLinearIcon size={20} aria-label="Add image" />;
}
```

For smaller bundles, import a single generated component:

```tsx
import AddImageLinearIcon from "master-icon/react/AddImageLinearIcon";
```

### Raw SVG

```ts
import addImage from "master-icon/svg/linear/add-image.svg";
import addImageFilled from "master-icon/svg/filled/add-image.svg";
```

### Metadata

```ts
import icons from "master-icon/metadata";
```

The generated metadata is available at `metadata/icons.json`.

## Project Structure

```text
icons/
  filled/       Source SVG files for filled icons
  linear/       Source SVG files for linear icons
metadata/       Generated icon index, duplicate report, and legacy path map
scripts/        Build and validation scripts
dist/           Generated React package output, ignored by Git
```

## Development

```bash
npm run build
npm run check
npm pack --dry-run
```

`npm run build` generates:

- `metadata/icons.json`
- `metadata/duplicates.json`
- `metadata/legacy-map.json`
- `dist/react/*`

`metadata/legacy-map.json` maps the previous flat filenames, such as `add-image-linear.svg`, to the new source path.

## Icon Rules

- Every icon must be `24x24`.
- Every icon must use `currentColor`.
- Every filled icon must have a `linear` variant. Linear-only icons are supported.
- Add new SVGs under `icons/filled` or `icons/linear`, then run `npm run build && npm run check`.

## Trademark Notice

Some icons may represent third-party brands, products, or services. Those names and marks belong to their respective owners. Their inclusion does not imply endorsement.
