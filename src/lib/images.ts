/**
 * Картинки в записках.
 *
 * Хранятся файлами рядом с nook.json, а в самой записке остаётся только имя —
 * `<img data-nook="1712...-4.jpg">`. Причина простая: хранилище переписывается
 * целиком на каждую правку текста, и фотография внутри него означала бы, что
 * каждое нажатие клавиши гоняет по диску мегабайты. Плюс имя вместо ссылки —
 * это ещё и безопасность: в сохранённой разметке нет ни одного адреса, который
 * вебвью мог бы попытаться открыть.
 */

import { isTauri } from './persistence'

/** Длинная сторона после уменьшения. Больше на экране телефона не разглядеть. */
const MAX_SIDE = 1600
const QUALITY = 0.82

/** Ровно то, что выдаёт save_image: цифры, буквы, дефис и точка. */
const NAME = /^[A-Za-z0-9.-]{1,64}$/

export function isImageName(value: string): boolean {
  return NAME.test(value) && !value.includes('..')
}

/**
 * Уменьшает снимок и отдаёт готовые к записи байты.
 *
 * Снимок с телефона — это 4000 пикселей по длинной стороне и мегабайты веса.
 * В записке он всё равно показывается шириной в экран, так что хранить
 * оригинал незачем: 1600 точек хватает и для полноэкранного просмотра.
 */
async function shrink(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('нет холста для уменьшения картинки')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('не удалось сжать картинку')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Сохраняет картинку и возвращает её имя для вставки в записку. */
export async function saveImage(file: File): Promise<string> {
  const bytes = await shrink(file)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('save_image', { bytes: Array.from(bytes), ext: 'jpg' })
}

/**
 * Ссылка, по которой вебвью покажет картинку.
 *
 * Через asset-протокол, а не через чтение файла в память: браузер сам подтянет
 * файл с диска, и картинка не проезжает через мост между приложением и
 * страницей. Область протокола сужена до папки images — см. tauri.conf.json.
 */
export async function imageUrl(name: string): Promise<string | null> {
  if (!isImageName(name) || !isTauri()) return null
  try {
    const { convertFileSrc, invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string>('image_path', { name })
    return convertFileSrc(path)
  } catch {
    return null
  }
}

/** Имена всех картинок, на которые ссылается разметка. */
export function imagesIn(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out: string[] = []
  for (const img of doc.querySelectorAll('img[data-nook]')) {
    const name = img.getAttribute('data-nook') ?? ''
    if (isImageName(name)) out.push(name)
  }
  return out
}

/**
 * Подставляет настоящие адреса перед показом в редакторе.
 *
 * В хранилище лежит только имя, а вебвью нужен src. Обратное превращение
 * делает sanitize при сохранении: он выбрасывает src и оставляет имя.
 */
export async function hydrate(html: string): Promise<string> {
  const names = [...new Set(imagesIn(html))]
  if (names.length === 0) return html

  const urls = new Map<string, string>()
  await Promise.all(
    names.map(async (name) => {
      const url = await imageUrl(name)
      if (url) urls.set(name, url)
    }),
  )

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const img of doc.querySelectorAll('img[data-nook]')) {
    const url = urls.get(img.getAttribute('data-nook') ?? '')
    if (url) img.setAttribute('src', url)
  }
  return doc.body.innerHTML
}

/** Удаляет файлы, на которые больше не ссылается ни одна записка. */
export async function pruneImages(keep: string[]): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke<number>('prune_images', { keep })
  } catch {
    /* не удалось прибраться — не повод мешать работе */
  }
}
