/**
 * Сведение двух копий данных в одну.
 *
 * Правило одно и то же для всего: побеждает более поздняя правка — но не
 * файла целиком, а каждой записи по отдельности. Разница принципиальная.
 * Сравнение файлов означало бы, что заметка, дописанная утром на телефоне,
 * стирает задачу, заведённую днём на ноутбуке: файл-то один. Сравнение записей
 * оставляет обе.
 *
 * Пользователь здесь один, и два устройства редко правят одно и то же в один
 * день. Но «редко» — не «никогда», а терять запись нельзя вовсе, поэтому
 * слияние сделано честно, а не через «чья копия свежее, та и права».
 */

import type { AppData, Grave } from '../types'

interface Stamped {
  id: string
  updatedAt: number
}

/** Могилы обеих сторон, по самой поздней записи на каждый идентификатор. */
function mergeGraves(a: Grave[], b: Grave[]): Grave[] {
  const latest = new Map<string, number>()
  for (const grave of [...a, ...b]) {
    const known = latest.get(grave.id) ?? 0
    if (grave.at > known) latest.set(grave.id, grave.at)
  }
  return [...latest].map(([id, at]) => ({ id, at }))
}

/**
 * Сводит один список.
 *
 * Порядок берётся от местной копии: он бывает выставлен руками, и приезжающая
 * копия не должна его перетасовывать. Записи, которых здесь ещё не было,
 * дописываются в конец.
 */
function mergeList<T extends Stamped>(local: T[], remote: T[], graves: Map<string, number>): T[] {
  const byId = new Map<string, T>()
  for (const item of remote) byId.set(item.id, item)

  const out: T[] = []
  const taken = new Set<string>()

  const alive = (item: T) => {
    const buried = graves.get(item.id)
    // Правка позже похорон означает, что запись воскресили осознанно —
    // например, отменили удаление. Тогда она остаётся.
    return buried === undefined || item.updatedAt > buried
  }

  for (const mine of local) {
    taken.add(mine.id)
    const theirs = byId.get(mine.id)
    const winner = theirs && theirs.updatedAt > mine.updatedAt ? theirs : mine
    if (alive(winner)) out.push(winner)
  }

  for (const theirs of remote) {
    if (taken.has(theirs.id)) continue
    if (alive(theirs)) out.push(theirs)
  }

  return out
}

/**
 * Сводит две копии данных.
 *
 * `local` — то, что сейчас в приложении, `remote` — то, что лежит в
 * репозитории. Результат годится для обеих сторон: слияние симметрично во
 * всём, кроме порядка записей.
 */
export function mergeData(local: AppData, remote: AppData): AppData {
  const graveyard = mergeGraves(local.graveyard, remote.graveyard)
  const graves = new Map(graveyard.map((g) => [g.id, g.at]))

  // Настройки — единственное, что сводится целиком: разбирать их по полям
  // значило бы завести метку на каждую галочку ради вещей, которые меняют раз
  // в месяц и на одном устройстве.
  const settingsFromRemote = remote.settingsAt > local.settingsAt

  return {
    version: 10,
    tasks: mergeList(local.tasks, remote.tasks, graves),
    categories: mergeList(local.categories, remote.categories, graves),
    notes: mergeList(local.notes, remote.notes, graves),
    films: mergeList(local.films, remote.films, graves),
    // Отметки привычки едут вместе с ней: побеждает копия, где ставили галочку
    // позже. Два устройства в один день редко правят одну и ту же привычку.
    habits: mergeList(local.habits, remote.habits, graves),
    settings: settingsFromRemote ? remote.settings : local.settings,
    settingsAt: Math.max(local.settingsAt, remote.settingsAt),
    graveyard,
  }
}

/** Правда ли две копии совпадают по содержимому. Экономит лишнюю отправку. */
export function sameData(a: AppData, b: AppData): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
