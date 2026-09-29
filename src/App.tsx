import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEFAULT_OPTIONS, buildPdf, type ImageInput, type Options } from "@/lib/pdf"

type Item = { id: string; file: File; url: string }

const SELECTS = [
  {
    key: "size",
    label: "Page size",
    options: [
      ["a4", "A4"],
      ["letter", "Letter"],
      ["legal", "Legal"],
      ["a3", "A3"],
      ["a5", "A5"],
      ["fit", "Fit to image"],
    ],
  },
  {
    key: "orientation",
    label: "Orientation",
    options: [
      ["auto", "Auto (match image)"],
      ["portrait", "Portrait"],
      ["landscape", "Landscape"],
    ],
  },
  {
    key: "fit",
    label: "Image fit",
    options: [
      ["contain", "Fit (keep aspect ratio)"],
      ["cover", "Fill (keep aspect ratio, crop)"],
      ["stretch", "Stretch (ignore aspect ratio)"],
    ],
  },
] as const

// JPEG/PNG are embedded as-is (no quality loss); other formats are decoded and re-encoded as lossless PNG.
async function toImageInput(file: File): Promise<ImageInput> {
  if (file.type === "image/jpeg") return { bytes: new Uint8Array(await file.arrayBuffer()), type: "jpg" }
  if (file.type === "image/png") return { bytes: new Uint8Array(await file.arrayBuffer()), type: "png" }
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  const blob = await canvas.convertToBlob({ type: "image/png" })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "png" }
}

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Any change to images, order or settings invalidates the generated PDF.
  function invalidate() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    setPdfUrl(null)
    setError(null)
  }

  function updateOptions(patch: Partial<Options>) {
    invalidate()
    setOptions((o) => ({ ...o, ...patch }))
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    invalidate()
    const added = [...files]
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
    setItems((prev) => [...prev, ...added])
  }

  function remove(id: string) {
    invalidate()
    setItems((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item) URL.revokeObjectURL(item.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  function clear() {
    invalidate()
    items.forEach((i) => URL.revokeObjectURL(i.url))
    setItems([])
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (over && active.id !== over.id) {
      invalidate()
      setItems((prev) =>
        arrayMove(
          prev,
          prev.findIndex((i) => i.id === active.id),
          prev.findIndex((i) => i.id === over.id)
        )
      )
    }
  }

  async function generate() {
    invalidate()
    setBusy(true)
    try {
      const pdf = await buildPdf(await Promise.all(items.map((i) => toImageInput(i.file))), options)
      setPdfUrl(URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" })))
    } catch (e) {
      setError(`Could not generate PDF: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const active = items.find((i) => i.id === activeId)

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Image to PDF</h1>
          </CardTitle>
          <CardDescription>
            Add images, drag to reorder (or focus an image, press Space, then arrow keys), then press Done.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="files">Images</Label>
            <Input
              id="files"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ""
              }}
            />
          </div>
          {SELECTS.map(({ key, label, options: choices }) => (
            <div key={key} className="grid gap-2">
              <Label htmlFor={key}>{label}</Label>
              <Select
                value={options[key]}
                onValueChange={(v) => updateOptions({ [key]: v })}
                disabled={key === "orientation" && options.size === "fit"}
              >
                <SelectTrigger id={key} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="margin">Margin (mm)</Label>
            <Input
              id="margin"
              type="number"
              min={0}
              step={1}
              value={options.marginMm}
              onChange={(e) => updateOptions({ marginMm: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            <Button onClick={generate} disabled={items.length === 0 || busy}>
              {busy ? "Generating…" : "Done"}
            </Button>
            {pdfUrl && (
              <Button asChild variant="secondary">
                <a href={pdfUrl} download="images.pdf">
                  Download PDF
                </a>
              </Button>
            )}
            {items.length > 0 && (
              <Button variant="ghost" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <ol aria-label="Pages" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((item, index) => (
                <SortableItem key={item.id} item={item} index={index} onRemove={remove} />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay>
            {active && (
              <Card className="gap-0 overflow-hidden py-0 shadow-lg">
                <img src={active.url} alt="" className="aspect-square w-full object-contain" />
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </main>
  )
}

function SortableItem({ item, index, onRemove }: { item: Item; index: number; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-30" : undefined}
    >
      <Card className="relative gap-0 overflow-hidden py-0">
        <div
          {...attributes}
          {...listeners}
          aria-label={`Page ${index + 1}: ${item.file.name}. Press Space to move.`}
          className="cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src={item.url} alt="" className="aspect-square w-full bg-muted object-contain" />
          <p className="truncate px-2 py-1 text-xs">
            {index + 1}. {item.file.name}
          </p>
        </div>
        <Button
          size="icon"
          variant="secondary"
          className="absolute top-1 right-1 size-7"
          aria-label={`Remove ${item.file.name}`}
          onClick={() => onRemove(item.id)}
        >
          <XIcon />
        </Button>
      </Card>
    </li>
  )
}

export default App
