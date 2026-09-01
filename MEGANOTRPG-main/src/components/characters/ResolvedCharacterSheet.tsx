import type { ComponentProps, MouseEvent } from "react"
import ResolvedCharacterSheetBase from "./ResolvedCharacterSheetBase.tsx"

type Props = ComponentProps<typeof ResolvedCharacterSheetBase>
type ClassFocus = "class" | "subclass"

const FOCUS_KEY = "meganotrpg.character-class-focus"

function rememberFocus(event: MouseEvent<HTMLDivElement>) {
  const button = (event.target as HTMLElement).closest("button")
  const text = button?.textContent || ""
  let focus: ClassFocus | null = null
  if (text.includes("Способности подкласса")) focus = "subclass"
  else if (text.includes("Способности класса")) focus = "class"
  if (focus) window.sessionStorage.setItem(FOCUS_KEY, focus)
}

export default function ResolvedCharacterSheet(props: Props) {
  function openClassMechanics() {
    const classButton = document.querySelector<HTMLButtonElement>(".profile-v3__class")
    if (classButton) {
      classButton.click()
      return
    }
    props.onOpenClassReference?.()
  }

  return <div onClickCapture={rememberFocus}>
    <ResolvedCharacterSheetBase {...props} onOpenClassReference={openClassMechanics} />
  </div>
}
