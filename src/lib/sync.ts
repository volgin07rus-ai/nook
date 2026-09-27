/**
 * Синхронизация через приватный репозиторий на GitHub.
 *
 * Почему именно так: сервера держать не надо, платить не надо, а в придачу
 * получается история — каждая правка ложится коммитом, и любую версию можно
 * поднять со стороны GitHub, даже если приложение снесли с обоих устройств.
 * Для одного человека с двумя устройствами это лучший обмен из возможных.
 *
 * Чего это не даёт: мгновенности. GitHub ничего не присылает сам, его можно
 * только спрашивать. Поэтому правки уезжают через несколько секунд после
 * того, как их закончили, а второе устройство спрашивает раз в минуту, пока
 * открыто (см. lib/autosync.ts). Получается «в пределах минуты», а не «в ту же
 * секунду»; за секунду пришлось бы платить чужим сервером с твоими записями.
 */

import type { AppData } from '../types'
import { normalize } from '../types'
import { getState, replaceAll } from './store'
import { mergeData, sameData } from './merge'
import { imagesIn } from './images'
import { isTauri } from './persistence'
import { showToast } from './toast'

const API = 'https://api.github.com'
const DATA_PATH = 'nook.json'
const IMAGE_DIR = 'images'

export interface SyncConfig {
  owner: string
  repo: string
  token: string
  lastSha: string
  lastAt: number
}

export const EMPTY_CONFIG: SyncConfig = {
  owner: '',
  repo: '',
  token: '',
  lastSha: '',
  lastAt: 0,
}

export function isConfigured(config: SyncConfig): boolean {
  return !!(config.owner.trim() && config.repo.trim() && config.token.trim())
}

// --------------------------------------------------------------- настройки

export async function readConfig(): Promise<SyncConfig> {
  if (!isTauri()) return EMPTY_CONFIG
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<Record<string, unknown>>('read_sync_config')
    return {
      owner: String(raw.owner ?? ''),
      repo: String(raw.repo ?? ''),
      token: String(raw.token ?? ''),
      lastSha: String(raw.last_sha ?? ''),
      lastAt: Number(raw.last_at ?? 0),
    }
  } catch {
    return EMPTY_CONFIG
  }
}

export async function writeConfig(config: SyncConfig): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_sync_config', {
    config: {
      owner: config.owner.trim(),
      repo: config.repo.trim(),
      token: config.token.trim(),
      last_sha: config.lastSha,
      last_at: config.lastAt,
    },
  })
}

// ------------------------------------------------------------- base64/UTF-8

/**
 * btoa работает с байтами, а не с символами: русский текст ломает его в первой
 * же букве. Поэтому строка сначала переводится в байты, и только они кодируются.
 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ''))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// ------------------------------------------------------------------- запрос

interface GitFile {
  content: string
  sha: string
  /** Метка версии от GitHub: по ней спрашивают «а изменилось ли». */
  etag: string
}

/** Ответ «не изменилось» на условный запрос. */
const UNCHANGED = Symbol('unchanged')

async function api(
  config: SyncConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${API}/repos/${config.owner.trim()}/${config.repo.trim()}/contents/${path}`
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
}

/**
 * Читает файл. null — файла в репозитории ещё нет, и это не ошибка.
 *
 * С меткой версии запрос становится условным: если файл тот же, GitHub
 * отвечает коротким «не изменилось», не считает это в лимит и не гоняет
 * содержимое. На этом держится опрос раз в минуту — иначе он качал бы весь
 * файл каждый раз.
 */
async function getFile(config: SyncConfig, path: string): Promise<GitFile | null>
async function getFile(
  config: SyncConfig,
  path: string,
  etag: string,
): Promise<GitFile | null | typeof UNCHANGED>
async function getFile(
  config: SyncConfig,
  path: string,
  etag = '',
): Promise<GitFile | null | typeof UNCHANGED> {
  const response = await api(config, path, etag ? { headers: { 'If-None-Match': etag } } : undefined)
  if (response.status === 304) return UNCHANGED
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await describe(response))
  const json = (await response.json()) as { content?: string; sha?: string }
  return {
    content: json.content ?? '',
    sha: json.sha ?? '',
    etag: response.headers.get('etag') ?? '',
  }
}

async function putFile(
  config: SyncConfig,
  path: string,
  base64: string,
  sha: string | null,
  message: string,
): Promise<string> {
  const response = await api(config, path, {
    method: 'PUT',
    body: JSON.stringify({ message, content: base64, ...(sha ? { sha } : {}) }),
  })
  if (!response.ok) throw new Error(await describe(response))
  const json = (await response.json()) as { content?: { sha?: string } }
  return json.content?.sha ?? ''
}

/** Понятное сообщение вместо голого кода: чаще всего это токен или имя репо. */
async function describe(response: Response): Promise<string> {
  if (response.status === 401) return 'GitHub не принял токен'
  if (response.status === 403) return 'Нет доступа: у токена не хватает прав на этот репозиторий'
  if (response.status === 404) return 'Репозиторий не найден — проверь владельца и название'
  if (response.status === 409) return 'Репозиторий пуст: сделай в нём первый коммит'
  if (response.status === 422) return 'GitHub отклонил запись — попробуй ещё раз'
  let detail = ''
  try {
    const json = (await response.json()) as { message?: string }
    detail = json.message ?? ''
  } catch {
    /* тело может быть не json */
  }
  return `GitHub ответил ${response.status}${detail ? `: ${detail}` : ''}`
}

// ---------------------------------------------------------------- картинки

/** Имена картинок, лежащих в репозитории. */
async function remoteImages(config: SyncConfig): Promise<Set<string>> {
  const response = await api(config, IMAGE_DIR)
  if (response.status === 404) return new Set()
  if (!response.ok) throw new Error(await describe(response))
  const json = (await response.json()) as Array<{ name?: string }>
  return new Set(json.map((entry) => entry.name ?? '').filter(Boolean))
}

/**
 * Догоняет картинки в обе стороны.
 *
 * Только те, на которые ссылается хоть одна записка: удалённые из текста файлы
 * не поедут ни туда, ни обратно. Файлы называются по времени создания и потому
 * не сталкиваются — сравнивать содержимое не нужно, хватает имени.
 */
async function syncImages(config: SyncConfig, data: AppData): Promise<void> {
  const wanted = new Set(data.notes.flatMap((note) => imagesIn(note.body)))
  if (wanted.size === 0) return

  const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
  const there = await remoteImages(config)

  for (const name of wanted) {
    if (there.has(name)) {
      // Есть в репозитории — проверяем, есть ли здесь, и если нет, забираем.
      const path = await invoke<string>('image_path', { name })
      const local = await fetch(convertFileSrc(path)).then(
        (r) => r.ok,
        () => false,
      )
      if (local) continue

      const file = await getFile(config, `${IMAGE_DIR}/${name}`)
      if (!file) continue
      await invoke('save_image_as', {
        name,
        bytes: Array.from(bytesFromBase64(file.content)),
      })
      continue
    }

    // Нет в репозитории — отправляем туда.
    const path = await invoke<string>('image_path', { name })
    const response = await fetch(convertFileSrc(path)).catch(() => null)
    if (!response?.ok) continue
    const bytes = new Uint8Array(await response.arrayBuffer())
    await putFile(config, `${IMAGE_DIR}/${name}`, bytesToBase64(bytes), null, `фото ${name}`)
  }
}

// ------------------------------------------------------------------ синхрон

export interface SyncResult {
  ok: boolean
  message: string
  at: number
  /** Что после обмена лежит и здесь, и в репозитории. Есть только при успехе. */
  data?: AppData
}

let running = false

/** Метка версии файла, который забирали в последний раз. Только в памяти. */
let lastEtag = ''

export const isSyncing = (): boolean => running

export interface SyncOptions {
  /**
   * Опрос: спросить, изменился ли файл, и если нет — ничего не делать.
   * Местные правки при этом не отправляются, для них есть полный обмен.
   */
  poll?: boolean
}

/**
 * Свести местную копию с удалённой.
 *
 * Порядок: забрать, слить, отправить обратно, если после слияния получилось не
 * то же самое, что лежит в репозитории. Отправка идёт с указанием версии, от
 * которой отталкивались, — если в этот момент туда записало второе устройство,
 * GitHub откажет, и мы просто попробуем ещё раз со свежими данными.
 */
export async function syncNow(options: SyncOptions = {}): Promise<SyncResult> {
  const stamp = () => Date.now()
  if (running) return { ok: false, message: 'Синхронизация уже идёт', at: stamp() }

  const config = await readConfig()
  if (!isConfigured(config)) {
    return { ok: false, message: 'Синхронизация не настроена', at: stamp() }
  }

  running = true
  try {
    const file = await getFile(config, DATA_PATH, options.poll ? lastEtag : '')
    if (file === UNCHANGED) return { ok: true, message: 'Изменений нет', at: stamp() }
    if (file) lastEtag = file.etag

    const local = getState()

    const remote: AppData | null = file ? normalize(JSON.parse(fromBase64(file.content))) : null
    const merged = remote ? mergeData(local, remote) : local

    // Местная копия обновляется всегда, даже если отправлять нечего: могло
    // приехать что-то с другого устройства. Об этом стоит сказать — иначе
    // задача, появившаяся в списке сама собой, выглядит как сбой.
    if (!sameData(local, merged)) {
      replaceAll(merged)
      showToast('Обновлено с другого устройства')
    }

    let sha = file?.sha ?? ''
    if (!remote || !sameData(remote, merged)) {
      sha = await putFile(
        config,
        DATA_PATH,
        toBase64(JSON.stringify(merged)),
        file?.sha ?? null,
        `Nook: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      )
      // После своей записи метка устарела: следующий опрос заберёт файл
      // целиком один раз и убедится, что там наше.
      lastEtag = ''
    }

    await syncImages(config, merged)

    await writeConfig({ ...config, lastSha: sha, lastAt: stamp() })
    return { ok: true, message: 'Синхронизировано', at: stamp(), data: merged }
  } catch (error) {
    return { ok: false, message: String(error instanceof Error ? error.message : error), at: stamp() }
  } finally {
    running = false
  }
}

/**
 * Обмен, если он вообще настроен.
 *
 * Всё автоматическое зовёт именно эту, а не syncNow: без настроек она молча
 * ничего не делает, и приложение при первом запуске не ругается на то, чего
 * человек ещё не включал.
 */
export async function syncIfConfigured(options: SyncOptions = {}): Promise<SyncResult | null> {
  const config = await readConfig()
  if (!isConfigured(config)) return null
  return syncNow(options)
}

/** Проверка настроек без записи: отвечает, видит ли приложение репозиторий. */
export async function testConnection(config: SyncConfig): Promise<SyncResult> {
  const at = Date.now()
  if (!isConfigured(config)) return { ok: false, message: 'Заполни все три поля', at }
  try {
    const response = await fetch(`${API}/repos/${config.owner.trim()}/${config.repo.trim()}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) return { ok: false, message: await describe(response), at }
    const json = (await response.json()) as { private?: boolean; full_name?: string }
    if (json.private === false) {
      return {
        ok: false,
        message: 'Репозиторий публичный — данные увидит кто угодно. Сделай его приватным',
        at,
      }
    }
    return { ok: true, message: `Есть связь с ${json.full_name ?? 'репозиторием'}`, at }
  } catch (error) {
    return { ok: false, message: String(error instanceof Error ? error.message : error), at }
  }
}
