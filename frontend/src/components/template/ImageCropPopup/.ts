import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { close } from '@stores/popupStore'

export const IMAGE_CROP_MIN_ZOOM = 1
export const IMAGE_CROP_MAX_ZOOM = 4
export const IMAGE_CROP_ZOOM_STEP = 0.25

const DEFAULT_OUTPUT_WIDTH = 2048
const JPEG_QUALITY = 0.92

const WHEEL_ZOOM_SPEED = 0.0015
const PINCH_WHEEL_ZOOM_SPEED = 0.01
const WHEEL_LINE_HEIGHT = 16

const LOAD_FAILED = "This image couldn't be opened. Try a different file."
const CROP_FAILED = "This image couldn't be cropped. Try a smaller file."

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
}

export type ImageCropView = {
  zoom: number
  x: number
  y: number
}

export type ImageSize = {
  width: number
  height: number
}

const INITIAL_VIEW: ImageCropView = { zoom: 1, x: 0.5, y: 0.5 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function imageCropVisibleFraction(
  natural: ImageSize,
  aspectRatio: number,
  zoom: number,
): ImageSize {
  const imageAspect = natural.width / natural.height
  const wider = imageAspect > aspectRatio

  return {
    width: (wider ? aspectRatio / imageAspect : 1) / zoom,
    height: (wider ? 1 : imageAspect / aspectRatio) / zoom,
  }
}

export function imageCropClamp(
  view: ImageCropView,
  natural: ImageSize,
  aspectRatio: number,
): ImageCropView {
  const zoom = clamp(view.zoom, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM)
  const visible = imageCropVisibleFraction(natural, aspectRatio, zoom)

  return {
    zoom,
    x: clamp(view.x, visible.width / 2, 1 - visible.width / 2),
    y: clamp(view.y, visible.height / 2, 1 - visible.height / 2),
  }
}

export function imageCropPan(
  view: ImageCropView,
  natural: ImageSize,
  aspectRatio: number,
  dx: number,
  dy: number,
): ImageCropView {
  const visible = imageCropVisibleFraction(natural, aspectRatio, view.zoom)

  return imageCropClamp(
    { ...view, x: view.x - dx * visible.width, y: view.y - dy * visible.height },
    natural,
    aspectRatio,
  )
}

export function imageCropZoomAt(
  view: ImageCropView,
  natural: ImageSize,
  aspectRatio: number,
  nextZoom: number,
  anchor: { x: number; y: number },
): ImageCropView {
  const zoom = clamp(nextZoom, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM)
  const before = imageCropVisibleFraction(natural, aspectRatio, view.zoom)
  const after = imageCropVisibleFraction(natural, aspectRatio, zoom)

  return imageCropClamp(
    {
      zoom,
      x: view.x + anchor.x * (before.width - after.width),
      y: view.y + anchor.y * (before.height - after.height),
    },
    natural,
    aspectRatio,
  )
}

export function imageCropImageStyle(
  view: ImageCropView,
  natural: ImageSize | null,
  aspectRatio: number,
): CSSProperties {
  if (!natural) return { visibility: 'hidden' }

  const visible = imageCropVisibleFraction(natural, aspectRatio, view.zoom)

  return {
    width: `${100 / visible.width}%`,
    height: `${100 / visible.height}%`,
    transform: `translate(${-view.x * 100}%, ${-view.y * 100}%)`,
  }
}

function croppedFileName(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  return `${base}.${EXTENSIONS[type] ?? 'jpg'}`
}

export async function imageCropToFile(
  image: HTMLImageElement,
  file: File,
  view: ImageCropView,
  aspectRatio: number,
  outputWidth: number,
): Promise<File | null> {
  const natural = { width: image.naturalWidth, height: image.naturalHeight }
  const visible = imageCropVisibleFraction(natural, aspectRatio, view.zoom)

  const sw = visible.width * natural.width
  const sh = visible.height * natural.height
  const sx = view.x * natural.width - sw / 2
  const sy = view.y * natural.height - sh / 2

  const width = Math.max(1, Math.round(Math.min(sw, outputWidth)))
  const height = Math.max(1, Math.round(width / aspectRatio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return null

  try {
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
  } catch {
    return null
  }

  const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, JPEG_QUALITY),
  )
  if (!blob) return null

  return new File([blob], croppedFileName(file.name, blob.type), {
    type: blob.type,
    lastModified: Date.now(),
  })
}

type UseImageCropArgs = {
  id?: string
  file: File
  aspectRatio: number
  outputWidth?: number
  onSave?: (file: File) => void
}

export type ImageCrop = {
  src: string | null
  ready: boolean
  saving: boolean
  error: string | null
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  stageRef: (node: HTMLDivElement | null) => void
  frameRef: RefObject<HTMLDivElement | null>
  imageRef: RefObject<HTMLImageElement | null>
  frameStyle: CSSProperties
  imageStyle: CSSProperties
  handleLoad: (e: SyntheticEvent<HTMLImageElement>) => void
  handleError: () => void
  handlePointerDown: (e: PointerEvent<HTMLDivElement>) => void
  handlePointerMove: (e: PointerEvent<HTMLDivElement>) => void
  handlePointerEnd: (e: PointerEvent<HTMLDivElement>) => void
  handleZoomChange: (e: ChangeEvent<HTMLInputElement>) => void
  zoomIn: () => void
  zoomOut: () => void
  save: () => void
  dismiss: () => void
}

export function useImageCrop({
  id,
  file,
  aspectRatio,
  outputWidth = DEFAULT_OUTPUT_WIDTH,
  onSave,
}: UseImageCropArgs): ImageCrop {
  const [src, setSrc] = useState<string | null>(null)
  const [natural, setNatural] = useState<ImageSize | null>(null)
  const [view, setView] = useState<ImageCropView>(INITIAL_VIEW)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const pointers = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    setNatural(null)
    setError(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!stage || !natural) return

    const handleWheel = (e: WheelEvent) => {
      const frame = frameRef.current?.getBoundingClientRect()
      if (!frame) return
      e.preventDefault()

      const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * WHEEL_LINE_HEIGHT : e.deltaY
      const factor = Math.exp(-delta * (e.ctrlKey ? PINCH_WHEEL_ZOOM_SPEED : WHEEL_ZOOM_SPEED))
      const anchor = {
        x: (e.clientX - frame.left) / frame.width - 0.5,
        y: (e.clientY - frame.top) / frame.height - 0.5,
      }

      setView((prev) => imageCropZoomAt(prev, natural, aspectRatio, prev.zoom * factor, anchor))
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [stage, natural, aspectRatio])

  const zoomAroundCentre = (nextZoom: (prev: number) => number) => {
    if (!natural) return
    setView((prev) =>
      imageCropZoomAt(prev, natural, aspectRatio, nextZoom(prev.zoom), { x: 0, y: 0 }),
    )
  }

  return {
    src,
    ready: natural !== null,
    saving,
    error,
    zoom: view.zoom,
    canZoomIn: natural !== null && view.zoom < IMAGE_CROP_MAX_ZOOM,
    canZoomOut: natural !== null && view.zoom > IMAGE_CROP_MIN_ZOOM,
    stageRef: setStage,
    frameRef,
    imageRef,
    frameStyle: { '--image-crop-popup-aspect': String(aspectRatio) } as CSSProperties,
    imageStyle: imageCropImageStyle(view, natural, aspectRatio),

    handleLoad: (e) => {
      const { naturalWidth, naturalHeight } = e.currentTarget

      if (!naturalWidth || !naturalHeight) {
        setError(LOAD_FAILED)
        return
      }
      setNatural({ width: naturalWidth, height: naturalHeight })
      setView(INITIAL_VIEW)
    },

    handleError: () => setError(LOAD_FAILED),

    handlePointerDown: (e) => {
      if (!natural || (e.pointerType === 'mouse' && e.button !== 0)) return
      e.currentTarget.setPointerCapture(e.pointerId)
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    },

    handlePointerMove: (e) => {
      const previous = pointers.current.get(e.pointerId)
      const frame = frameRef.current?.getBoundingClientRect()
      if (!previous || !frame || !natural) return

      const current = { x: e.clientX, y: e.clientY }
      pointers.current.set(e.pointerId, current)

      const other = [...pointers.current].find(([pointerId]) => pointerId !== e.pointerId)?.[1]

      if (!other) {
        const dx = (current.x - previous.x) / frame.width
        const dy = (current.y - previous.y) / frame.height
        setView((prev) => imageCropPan(prev, natural, aspectRatio, dx, dy))
        return
      }

      const before = Math.hypot(previous.x - other.x, previous.y - other.y)
      const after = Math.hypot(current.x - other.x, current.y - other.y)
      if (before === 0) return

      const midpoint = { x: (current.x + other.x) / 2, y: (current.y + other.y) / 2 }
      const anchor = {
        x: (midpoint.x - frame.left) / frame.width - 0.5,
        y: (midpoint.y - frame.top) / frame.height - 0.5,
      }
      const dx = (current.x - previous.x) / 2 / frame.width
      const dy = (current.y - previous.y) / 2 / frame.height

      setView((prev) =>
        imageCropZoomAt(
          imageCropPan(prev, natural, aspectRatio, dx, dy),
          natural,
          aspectRatio,
          prev.zoom * (after / before),
          anchor,
        ),
      )
    },

    handlePointerEnd: (e) => {
      pointers.current.delete(e.pointerId)
    },

    handleZoomChange: (e) => {
      const next = Number(e.target.value)
      zoomAroundCentre(() => next)
    },

    zoomIn: () => zoomAroundCentre((prev) => prev + IMAGE_CROP_ZOOM_STEP),
    zoomOut: () => zoomAroundCentre((prev) => prev - IMAGE_CROP_ZOOM_STEP),

    save: async () => {
      const image = imageRef.current
      if (!image || !natural || saving) return

      setSaving(true)
      setError(null)
      const cropped = await imageCropToFile(image, file, view, aspectRatio, outputWidth)

      setSaving(false)

      if (!cropped) {
        setError(CROP_FAILED)
        return
      }

      onSave?.(cropped)
      if (id) close(id)
    },

    dismiss: () => {
      if (id) close(id)
    },
  }
}
