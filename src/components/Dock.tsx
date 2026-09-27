import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import type { Icon, IconWeight } from '@phosphor-icons/react'
import { EASE_OUT, T, T_DOCK } from '../lib/motion'

export interface DockItem {
  id: string
  label: string
  Icon: Icon
  weight?: IconWeight
  /** Красная точка у иконки: в разделе есть просроченное. */
  alert?: boolean
  /** Кнопка открывает шторку, а не раздел, и сообщает, открыта ли она. */
  popup?: { open: boolean }
  onPress: () => void
}

/** Высота полосы, диаметр шарика и насколько он выглядывает над полосой. */
const HEIGHT = 60
const BALL = 44
const RISE = 30
/** Внутренние поля полосы: дорожка шарика короче полосы на них с обеих сторон. */
const INSET = 8

/**
 * Чаша под шариком: полуширина и глубина.
 *
 * Профиль — квадрат приподнятого косинуса: у краёв он ложится в ровную кромку
 * почти незаметно, и полоса не «ломается» в месте, где начинается прогиб, а
 * плавно проседает. Широкая и неглубокая — так и выглядит продавленная
 * поверхность, а не прорезь. Между шариком и чашей везде не меньше 6 пикселей.
 */
const BOWL_W = 64
const BOWL_D = 22

/**
 * Контур полосы с чашей под точкой cx.
 *
 * Верхний край собирается по точкам — так чаша и скруглённые углы сшиваются
 * сами: где чаша глубже угла, берётся чаша, где угол круче — угол. Нижняя
 * половина — обычные дуги.
 */
function outline(width: number, cx: number, depth: number): string {
  const r = HEIGHT / 2
  const bowl = (x: number) => {
    const dx = Math.abs(x - cx)
    if (dx >= BOWL_W) return 0
    const lift = (1 + Math.cos((Math.PI * dx) / BOWL_W)) / 2
    return depth * lift * lift
  }
  const points: string[] = []
  const push = (x: number, y: number) => points.push(`${x.toFixed(1)} ${y.toFixed(1)}`)

  // Левый угол: от середины левого края вверх до начала прямого участка.
  const STEPS = 14
  for (let i = 0; i <= STEPS; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / STEPS)
    const x = r + r * Math.cos(a)
    push(x, Math.max(r + r * Math.sin(a), bowl(x)))
  }
  for (let x = r + 2; x < width - r; x += 2) push(x, bowl(x))
  // Правый угол: от конца прямого участка вниз до середины правого края.
  for (let i = 0; i <= STEPS; i++) {
    const a = 1.5 * Math.PI + (Math.PI / 2) * (i / STEPS)
    const x = width - r + r * Math.cos(a)
    push(x, Math.max(r + r * Math.sin(a), bowl(x)))
  }

  return `M ${points.join(' L ')} A ${r} ${r} 0 0 1 ${(width - r).toFixed(1)} ${HEIGHT} H ${r} A ${r} ${r} 0 0 1 0 ${r} Z`
}

/**
 * Нижнее меню: овальная полоса с иконками и шарик над текущим разделом.
 *
 * Шарик один на всё меню и переезжает от кнопки к кнопке, а не гаснет в одном
 * месте и зажигается в другом. Полоса под ним прогибается, и прогиб едет
 * вместе с ним: обе величины берутся из одного и того же значения, поэтому
 * разойтись по дороге они не могут. Иконка внутри меняется в полёте: старая
 * исчезает на старте, новая проявляется к прилёту, — посередине пути шарик
 * пустой и не показывает раздел, из которого уже ушёл.
 *
 * Под шариком иконка самой кнопки прячется: две одинаковые картинки друг над
 * другом со сдвигом читались бы как ошибка отрисовки.
 */
export function Dock({
  items,
  active,
  ball,
  phone = false,
}: {
  items: DockItem[]
  /** Номер кнопки под шариком; -1 — шарика нет. */
  active: number
  /** Что показать в шарике вместо иконки самой кнопки. У «Ещё» это раздел,
   *  в котором сейчас находишься, — иначе по меню не понять, где ты. */
  ball?: { key: string; Icon: Icon }
  phone?: boolean
}) {
  const reduce = useReducedMotion()
  const current = active >= 0 ? items[active] : undefined
  const BallIcon = ball?.Icon ?? current?.Icon
  const ballKey = ball?.key ?? current?.id

  // Ширина полосы нужна в пикселях: контур считается по точкам.
  const barRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    // offsetWidth, а не getBoundingClientRect: нужна ширина в координатах
    // самой полосы, а прямоугольник на экране зависит от трансформаций предков.
    const measure = () => setWidth(bar.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  // Одно значение на шарик и чашу: центр шарика в пикселях от левого края.
  const x = useMotionValue(0)
  const depth = useMotionValue(0)
  const w = useMotionValue(0)
  const settled = useRef(false)

  useEffect(() => {
    w.set(width)
    if (width === 0) return
    const slot = (width - INSET * 2) / items.length
    const target = INSET + slot * (Math.max(active, 0) + 0.5)
    const instant = reduce || !settled.current
    // Первая отрисовка — сразу на место: лететь из угла экрана шарику незачем.
    if (instant) {
      x.set(target)
      depth.set(current ? BOWL_D : 0)
      settled.current = true
      return
    }
    if (active >= 0) animate(x, target, T_DOCK)
    animate(depth, current ? BOWL_D : 0, T)
  }, [active, width, items.length, current, reduce, x, depth, w])

  const clipPath = useTransform([x, w, depth], ([cx, bw, d]) =>
    (bw as number) > 0 ? `path("${outline(bw as number, cx as number, d as number)}")` : 'none',
  )

  return (
    <nav
      aria-label="Разделы"
      className={`shrink-0 ${phone ? 'px-4' : 'flex justify-center'}`}
      style={{
        paddingTop: RISE,
        paddingBottom: phone ? 'calc(var(--safe-bottom, 0px) + 10px)' : 12,
      }}
    >
      <div ref={barRef} className="relative flex" style={{ height: HEIGHT, padding: `0 ${INSET}px` }}>
        {/*
         * Подложка отдельно от кнопок и в двух слоях. Тень — фильтр на
         * обёртке, а вырез — на самой подложке: тень считается по тому, что
         * осталось после выреза, и потому огибает чашу. Повесить тень на тот
         * же элемент нельзя — вырез обрезал бы её вместе со всем, что снаружи.
         */}
        <div aria-hidden className="dock-shadow pointer-events-none absolute inset-0">
          <motion.div className="h-full w-full bg-surface" style={{ clipPath }} />
        </div>

        {items.map((item, index) => {
          const here = index === active
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onPress}
              aria-label={item.label}
              title={phone ? undefined : item.label}
              aria-current={here ? 'page' : undefined}
              aria-haspopup={item.popup ? 'dialog' : undefined}
              aria-expanded={item.popup?.open}
              className={`group focus-ring relative grid place-items-center rounded-full ${
                phone ? 'flex-1' : 'w-16'
              }`}
            >
              <span
                className={`relative grid place-items-center transition-[opacity,color,scale] duration-150 group-active:scale-90 ${
                  here ? 'opacity-0' : 'text-fg-2 group-hover:text-accent'
                }`}
              >
                <item.Icon size={22} {...(item.weight ? { weight: item.weight } : {})} />
                {item.alert && (
                  <span className="dock-alert absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-danger" />
                )}
              </span>
            </button>
          )
        })}

        {current && BallIcon && (
          <motion.span
            aria-hidden
            className="dock-ball pointer-events-none absolute grid place-items-center rounded-full"
            style={{ width: BALL, height: BALL, top: -RISE, marginLeft: -BALL / 2, left: x }}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={ballKey}
                className="absolute inset-0 grid place-items-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { delay: reduce ? 0 : 0.07, duration: 0.16, ease: EASE_OUT },
                }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.08 } }}
              >
                <BallIcon size={20} />
              </motion.span>
            </AnimatePresence>

            {current.alert && (
              <span className="dock-alert absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-danger" />
            )}
          </motion.span>
        )}
      </div>
    </nav>
  )
}
