/**
 * Обмен без кнопки.
 *
 * GitHub ничего не присылает сам, поэтому «само» складывается из трёх привычек
 * приложения:
 *
 *   - правки уезжают через несколько секунд после того, как их закончили;
 *   - пока приложение на экране, оно раз в минуту спрашивает, не изменился ли
 *     файл, — дёшево, потому что спрашивает с меткой версии (см. getFile);
 *   - при уходе с экрана и возвращении на него идёт полный обмен.
 *
 * Итог: правка с телефона появляется на компьютере в пределах минуты, если
 * тот открыт, и сразу при открытии, если был закрыт.
 */

import { getState, subscribe } from './store'
import { isSyncing, syncIfConfigured } from './sync'

/** Как часто спрашивать, пока приложение на экране. */
const POLL_MS = 60_000

/** Сколько тишины после последней правки, прежде чем её отправить. */
const PUSH_DELAY_MS = 6_000

export function startAutoSync(): () => void {
  let settled = getState()
  let pushTimer: number | undefined
  let pollTimer: number | undefined

  /*
   * «Отправленным» считается ровно то, что обмен вернул, а не то, что лежит в
   * хранилище после него: если во время обмена что-то правили, хранилище уже
   * ушло вперёд, и эта правка должна уехать следующей.
   */
  const full = async () => {
    const result = await syncIfConfigured()
    if (result?.data) settled = result.data
  }

  const poll = () => {
    if (document.visibilityState !== 'visible') return
    void syncIfConfigured({ poll: true }).then((result) => {
      if (result?.data) settled = result.data
    })
  }

  /*
   * Отправка с задержкой. Каждая правка сдвигает таймер: набор заметки — это
   * сотни правок подряд, и отправлять надо одну, когда печатать перестали.
   * Если в этот момент обмен уже идёт, ждём ещё столько же — иначе правка
   * осталась бы неотправленной до ухода с экрана.
   */
  const schedulePush = () => {
    window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(() => {
      pushTimer = undefined
      if (getState() === settled) return
      if (isSyncing()) {
        schedulePush()
        return
      }
      void full()
    }, PUSH_DELAY_MS)
  }

  const unsubscribe = subscribe(() => {
    if (getState() !== settled) schedulePush()
  })

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      // Уход с экрана: отправить всё, что накопилось, не дожидаясь таймера.
      window.clearTimeout(pushTimer)
      pushTimer = undefined
      void full()
    } else {
      void full()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  pollTimer = window.setInterval(poll, POLL_MS)

  return () => {
    unsubscribe()
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearTimeout(pushTimer)
    window.clearInterval(pollTimer)
  }
}
