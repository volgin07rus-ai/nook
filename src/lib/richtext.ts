/**
 * Notes carry formatting, so their body is markup rather than plain text.
 *
 * The alternative was markdown in a plain textarea, which loses on both ends:
 * you would type asterisks and read asterisks, and "a bit bigger" has no
 * markdown spelling at all. Markup in a contenteditable shows the result.
 *
 * The cost is that a note body is now arbitrary markup, and it can arrive from
 * outside — the import field in settings takes any file the user pastes. So
 * everything read from storage goes through `sanitize` first, which keeps an
 * allowlist and drops the rest. Nothing here trusts its input.
 */

/** Everything the toolbar and the browser's own commands can produce. */
const ALLOWED_TAGS = new Set([
  'P',
  'DIV',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  // Strikethrough: the browser's own command emits <strike>, older content
  // and pastes bring <s> and <del>. All three mean the same line through text.
  'S',
  'STRIKE',
  'DEL',
  'H2',
  'SPAN',
  'UL',
  'OL',
  'LI',
])

/**
 * Attributes are allowlisted per tag and per value, not just per name: `style`
 * is only ever a font size in pixels, and a class is only one of the two names
 * the stylesheet knows. Anything else is dropped, so no attribute can smuggle
 * a script or a url through.
 */
const FONT_SIZE = /^font-size:\s*(\d{1,2})px;?$/
const MIN_SIZE = 8
const MAX_SIZE = 64

function keptAttributes(el: Element): Array<[string, string]> {
  const kept: Array<[string, string]> = []

  if (el.tagName === 'SPAN') {
    const style = el.getAttribute('style')?.trim() ?? ''
    const match = FONT_SIZE.exec(style)
    const size = match ? Number(match[1]) : NaN
    if (size >= MIN_SIZE && size <= MAX_SIZE) kept.push(['style', `font-size: ${size}px`])
  }

  // 'sm' is the old three-step small block, kept so notes written before the
  // numeric sizes still read the way they were written.
  if (el.tagName === 'P' && el.classList.contains('sm')) kept.push(['class', 'sm'])

  if (el.tagName === 'UL' && el.classList.contains('todo')) kept.push(['class', 'todo'])

  if (el.tagName === 'LI' && el.getAttribute('data-done') === '1') kept.push(['data-done', '1'])

  return kept
}

/**
 * Strips everything not on the allowlist, keeping the text inside. A dropped
 * <script> loses its tag and its contents; a dropped <font> keeps the words.
 */
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  const clean = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue

      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove()
        continue
      }

      const el = child as Element
      // Script and style hide their payload in a text node, so unwrapping them
      // would paste the payload into the document as visible text. Drop whole.
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') {
        el.remove()
        continue
      }

      if (!ALLOWED_TAGS.has(el.tagName)) {
        // Keep the words, lose the tag.
        el.replaceWith(...el.childNodes)
        continue
      }

      const kept = keptAttributes(el)
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name)
      for (const [name, value] of kept) el.setAttribute(name, value)

      clean(el)
    }
  }

  clean(doc.body)

  /*
   * A <ul> cannot live inside a <p>, but that is exactly what the browser's
   * list command builds when the selection spans whole paragraphs. Re-parsing
   * splits the paragraph around it and leaves two childless <p> behind — not a
   * blank line the user typed, which would hold a <br>, but debris. Drop it.
   */
  for (const p of [...doc.body.querySelectorAll('p')]) {
    if (p.childNodes.length === 0) p.remove()
  }

  return doc.body.innerHTML
}

/** Visible text, with block boundaries turned back into line breaks. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const lines: string[] = []

  const walk = (node: Node, line: { text: string }) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        line.text += child.textContent ?? ''
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue

      const el = child as Element
      if (el.tagName === 'BR') {
        lines.push(line.text)
        line.text = ''
        continue
      }
      if (
        el.tagName === 'P' ||
        el.tagName === 'DIV' ||
        el.tagName === 'H2' ||
        el.tagName === 'LI'
      ) {
        if (line.text) {
          lines.push(line.text)
          line.text = ''
        }
        const inner = { text: '' }
        walk(el, inner)
        lines.push(inner.text)
        continue
      }
      walk(el, line)
    }
  }

  const tail = { text: '' }
  walk(doc.body, tail)
  if (tail.text) lines.push(tail.text)

  return lines.join('\n')
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

/** Plain text from an older file, or from a paste, becomes one block per line. */
export function textToHtml(text: string): string {
  const escaped = text.replace(/[&<>]/g, (c) => ESCAPES[c])
  return escaped
    .split('\n')
    .map((line) => (line ? `<p>${line}</p>` : '<p><br></p>'))
    .join('')
}

/** True when a body still looks like the plain text of an older file. */
export function looksLikePlainText(body: string): boolean {
  return !/<[a-z][^>]*>/i.test(body)
}
