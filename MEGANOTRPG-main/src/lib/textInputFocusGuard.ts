const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
])

type HorizontalArrow = "ArrowLeft" | "ArrowRight"

export function horizontalCaretHitsBoundary(
  key: HorizontalArrow,
  valueLength: number,
  selectionStart: number | null,
  selectionEnd: number | null,
): boolean {
  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) return false
  return key === "ArrowRight"
    ? selectionEnd >= valueLength
    : selectionStart <= 0
}

function textControlFromTarget(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  if (target instanceof HTMLTextAreaElement) return target
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type.toLocaleLowerCase()) ? target : null
  }
  if (!(target instanceof HTMLElement) || !target.isContentEditable) return null
  return target.closest<HTMLElement>("[contenteditable='true']") || target
}

function contentEditableHitsBoundary(control: HTMLElement, key: HorizontalArrow): boolean {
  const selection = window.getSelection()
  if (!selection?.isCollapsed || !selection.anchorNode || !control.contains(selection.anchorNode)) return false

  const remainder = document.createRange()
  remainder.selectNodeContents(control)
  try {
    if (key === "ArrowRight") remainder.setStart(selection.anchorNode, selection.anchorOffset)
    else remainder.setEnd(selection.anchorNode, selection.anchorOffset)
  } catch {
    return false
  }
  return remainder.toString().length === 0
}

/**
 * Prevent directional/spatial navigation from stealing focus when the caret is
 * already at the horizontal edge of an editable text control. Normal caret
 * movement inside the text is left completely native.
 */
export function installTextInputFocusGuard(target: Document = document): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const control = textControlFromTarget(event.target)
    if (!control) return

    const atBoundary = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
      ? horizontalCaretHitsBoundary(event.key, control.value.length, control.selectionStart, control.selectionEnd)
      : contentEditableHitsBoundary(control, event.key)

    if (!atBoundary) return

    event.preventDefault()
    event.stopPropagation()
    requestAnimationFrame(() => {
      if (document.activeElement !== control) control.focus({ preventScroll: true })
    })
  }

  target.addEventListener("keydown", onKeyDown, true)
  return () => target.removeEventListener("keydown", onKeyDown, true)
}
