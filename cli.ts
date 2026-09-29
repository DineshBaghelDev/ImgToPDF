#!/usr/bin/env node
// Usage: node cli.ts [options] <images or folders...>
import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { parseArgs } from "node:util"
import sharp from "sharp"
import { DEFAULT_OPTIONS, PAGE_SIZES, buildPdf } from "./src/lib/pdf.ts"
import type { Fit, ImageInput, Orientation, PageSize } from "./src/lib/pdf.ts"

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif"])
const SIZES = [...Object.keys(PAGE_SIZES), "fit"]
const ORIENTATIONS = ["auto", "portrait", "landscape"]
const FITS = ["contain", "cover", "stretch"]

const HELP = `img2pdf - combine images into a PDF (pages follow argument order; folders are sorted by name)

Usage: img2pdf [options] <image|folder>...

Options:
  -o, --output <file>        output PDF (default: output.pdf)
  -s, --size <size>          ${SIZES.join(" | ")} (default: ${DEFAULT_OPTIONS.size})
  -r, --orientation <o>      ${ORIENTATIONS.join(" | ")} (default: ${DEFAULT_OPTIONS.orientation})
  -f, --fit <mode>           ${FITS.join(" | ")} (default: ${DEFAULT_OPTIONS.fit})
  -m, --margin <mm>          page margin in mm (default: ${DEFAULT_OPTIONS.marginMm})
  -h, --help                 show this help`

function fail(msg: string): never {
  console.error(`error: ${msg}\n\n${HELP}`)
  process.exit(1)
}

function oneOf<T extends string>(name: string, value: string, allowed: string[]): T {
  if (!allowed.includes(value)) fail(`invalid ${name} "${value}"`)
  return value as T
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: "string", short: "o", default: "output.pdf" },
    size: { type: "string", short: "s", default: DEFAULT_OPTIONS.size },
    orientation: { type: "string", short: "r", default: DEFAULT_OPTIONS.orientation },
    fit: { type: "string", short: "f", default: DEFAULT_OPTIONS.fit },
    margin: { type: "string", short: "m", default: String(DEFAULT_OPTIONS.marginMm) },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
if (positionals.length === 0) fail("no images given")

const marginMm = Number(values.margin)
if (!Number.isFinite(marginMm) || marginMm < 0) fail(`invalid margin "${values.margin}"`)
const options = {
  size: oneOf<PageSize>("size", values.size, SIZES),
  orientation: oneOf<Orientation>("orientation", values.orientation, ORIENTATIONS),
  fit: oneOf<Fit>("fit", values.fit, FITS),
  marginMm,
}

const files: string[] = []
for (const p of positionals) {
  if ((await stat(p)).isDirectory()) {
    const names = (await readdir(p))
      .filter((n) => IMAGE_EXT.has(extname(n).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    files.push(...names.map((n) => join(p, n)))
  } else {
    files.push(p)
  }
}
if (files.length === 0) fail("no images found")

const images: ImageInput[] = []
for (const file of files) {
  const ext = extname(file).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") images.push({ bytes: await readFile(file), type: "jpg" })
  else if (ext === ".png") images.push({ bytes: await readFile(file), type: "png" })
  // Other formats are converted losslessly to PNG (auto-rotated from EXIF).
  else images.push({ bytes: await sharp(file).rotate().png().toBuffer(), type: "png" })
}

const pdf = await buildPdf(images, options)
await writeFile(values.output, pdf)
console.log(`Wrote ${values.output} (${images.length} page${images.length === 1 ? "" : "s"})`)
