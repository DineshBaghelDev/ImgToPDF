// Shared PDF builder used by both the web UI and the CLI (no DOM / Node APIs here).
import {
  PDFDocument,
  clip,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "pdf-lib"

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
} as const

export type PageSize = keyof typeof PAGE_SIZES | "fit"
export type Orientation = "auto" | "portrait" | "landscape"
export type Fit = "contain" | "cover" | "stretch"

export type Options = {
  size: PageSize
  orientation: Orientation
  fit: Fit
  marginMm: number
}

export const DEFAULT_OPTIONS: Options = {
  size: "a4",
  orientation: "auto",
  fit: "contain",
  marginMm: 10,
}

// Only JPEG and PNG can be embedded directly; callers convert anything else to PNG first.
export type ImageInput = { bytes: Uint8Array; type: "jpg" | "png" }

const MM_TO_PT = 72 / 25.4

export async function buildPdf(images: ImageInput[], opts: Options): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const margin = Math.max(0, opts.marginMm) * MM_TO_PT

  for (const { bytes, type } of images) {
    const img = type === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
    const rotation = type === "jpg" ? jpegRotation(bytes) : 0
    const sideways = rotation === 90 || rotation === 270
    // Dimensions as the image should be displayed (after EXIF rotation).
    const iw = sideways ? img.height : img.width
    const ih = sideways ? img.width : img.height

    let pw: number, ph: number
    if (opts.size === "fit") {
      pw = iw + 2 * margin
      ph = ih + 2 * margin
    } else {
      const [a, b] = PAGE_SIZES[opts.size]
      const landscape = opts.orientation === "landscape" || (opts.orientation === "auto" && iw > ih)
      ;[pw, ph] = landscape ? [b, a] : [a, b]
    }

    const page = doc.addPage([pw, ph])
    const bw = Math.max(1, pw - 2 * margin)
    const bh = Math.max(1, ph - 2 * margin)

    // Target rectangle for the displayed image.
    let w = bw
    let h = bh
    if (opts.fit !== "stretch") {
      const scale = (opts.fit === "contain" ? Math.min : Math.max)(bw / iw, bh / ih)
      w = iw * scale
      h = ih * scale
    }
    const x = margin + (bw - w) / 2
    const y = margin + (bh - h) / 2

    if (opts.fit === "cover") {
      page.pushOperators(pushGraphicsState(), rectangle(margin, margin, bw, bh), clip(), endPath())
    }

    // pdf-lib rotates counter-clockwise around (x, y); position the anchor so the
    // rotated image lands exactly on the target rectangle.
    if (rotation === 90) {
      page.drawImage(img, { x, y: y + h, width: h, height: w, rotate: degrees(-90) })
    } else if (rotation === 180) {
      page.drawImage(img, { x: x + w, y: y + h, width: w, height: h, rotate: degrees(180) })
    } else if (rotation === 270) {
      page.drawImage(img, { x: x + w, y, width: h, height: w, rotate: degrees(90) })
    } else {
      page.drawImage(img, { x, y, width: w, height: h })
    }

    if (opts.fit === "cover") page.pushOperators(popGraphicsState())
  }

  return doc.save()
}

// Clockwise rotation needed to display a JPEG, from its EXIF orientation tag (mirrored variants ignored).
function jpegRotation(b: Uint8Array): 0 | 90 | 180 | 270 {
  try {
    return readExifRotation(b)
  } catch {
    return 0 // malformed EXIF: draw as stored
  }
}

function readExifRotation(b: Uint8Array): 0 | 90 | 180 | 270 {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 2
  while (i + 4 < b.length && b[i] === 0xff) {
    const marker = b[i + 1]
    const len = v.getUint16(i + 2)
    if (marker === 0xe1 && v.getUint32(i + 4) === 0x45786966) {
      const t = i + 10 // TIFF header
      const le = v.getUint16(t) === 0x4949
      const ifd = t + v.getUint32(t + 4, le)
      const count = v.getUint16(ifd, le)
      for (let e = 0; e < count; e++) {
        const p = ifd + 2 + e * 12
        if (v.getUint16(p, le) === 0x0112) {
          const o = v.getUint16(p + 8, le)
          return o === 3 ? 180 : o === 6 ? 90 : o === 8 ? 270 : 0
        }
      }
      return 0
    }
    if (marker === 0xda) break // start of image data
    i += 2 + len
  }
  return 0
}
