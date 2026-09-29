# ImgToPDF

Combine images into a single PDF. Web UI (drag to reorder) and CLI.

JPEG/PNG are embedded as-is (no re-compression); other formats are converted to lossless PNG. JPEG EXIF rotation is respected.

## Setup

Requires Node.js 23.6+ (runs the TypeScript CLI directly).

```sh
npm install
```

## Web UI

```sh
npm run dev
```

Open the printed URL, add images, drag to reorder (keyboard: focus an image, Space, arrow keys, Space), pick settings, press **Done**, then **Download PDF**. Everything runs in the browser; nothing is uploaded.

## CLI

```sh
node cli.ts -o out.pdf photo1.jpg photo2.png ./folder
# or: npm link, then: img2pdf -o out.pdf ./folder
```

Pages follow argument order; folders are sorted by name (natural order).

| Option | Values | Default |
| --- | --- | --- |
| `-o, --output` | file path | `output.pdf` |
| `-s, --size` | `a4` `letter` `legal` `a3` `a5` `fit` (page = image size) | `a4` |
| `-r, --orientation` | `auto` (match image) `portrait` `landscape` | `auto` |
| `-f, --fit` | `contain` (keep aspect) `cover` (keep aspect, crop) `stretch` | `contain` |
| `-m, --margin` | mm | `10` |
