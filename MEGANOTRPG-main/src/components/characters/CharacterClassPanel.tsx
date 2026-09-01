import { useEffect, useState } from "react"
import type { ResolvedCharacterContract } from "../../character-engine/index.ts"
import { registeredCharacterClassPackages } from "../../rule-templates/classPackages.ts"
import CharacterClassPanelBase from "./CharacterClassPanelBase.tsx"
import CharacterTemplateChoices from "./CharacterTemplateChoices.tsx"
import WizardArcaneRecoveryPanel from "./WizardArcaneRecoveryPanel.tsx"
import WizardCompletionPanel from "./WizardCompletionPanel.tsx"
import WizardSpellbookPanel from "./WizardSpellbookPanel.tsx"
import "./CharacterClassFocus.css"
import "./WizardSpellbookProgression.css"

type Props = {
  characterId: string
  contract: ResolvedCharacterContract
  onOpenReference?: () => void
}
type Focus = "all" | "class" | "subclass" | "spellbook"

const FOCUS_KEY = "meganotrpg.character-class-focus"

function initialFocus(): Focus {
  if (typeof window === "undefined") return "all"
  const value = window.sessionStorage.getItem(FOCUS_KEY)
  return value === "class" || value === "subclass" || value === "spellbook" ? value : "all"
}

export default function CharacterClassPanel(props: Props) {
  const [focus, setFocus] = useState<Focus>(initialFocus)
  const wizardPackage = registeredCharacterClassPackages(props.characterId)
    .find((entry) => entry.classCatalogKey === "class:wizard")
  const hasWizard = Boolean(wizardPackage)

  useEffect(() => () => {
    window.sessionStorage.removeItem(FOCUS_KEY)
  }, [])

  useEffect(() => {
    if (focus === "spellbook" && !hasWizard) setFocus("all")
  }, [focus, hasWizard])

  function choose(next: Focus) {
    setFocus(next)
    window.sessionStorage.setItem(FOCUS_KEY, next)
  }

  return <div className={`character-class-focus character-class-focus--${focus}${hasWizard ? " character-class-focus--has-wizard" : ""}`}>
    <nav className="character-class-focus__switch" aria-label="Механики класса">
      <button type="button" className={focus === "all" ? "is-active" : ""} onClick={() => choose("all")}>Все</button>
      <button type="button" className={focus === "class" ? "is-active" : ""} onClick={() => choose("class")}>Класс</button>
      <button type="button" className={focus === "subclass" ? "is-active" : ""} onClick={() => choose("subclass")}>Подкласс</button>
      {hasWizard && <button type="button" className={focus === "spellbook" ? "is-active" : ""} onClick={() => choose("spellbook")}>Моя книга</button>}
    </nav>
    {focus === "spellbook" && hasWizard ? <>
      <WizardSpellbookPanel characterId={props.characterId} />
      <WizardCompletionPanel characterId={props.characterId} />
    </> : <>
      <CharacterTemplateChoices characterId={props.characterId} />
      {wizardPackage && focus !== "subclass" && <WizardArcaneRecoveryPanel
        characterId={props.characterId}
        assignmentId={wizardPackage.classAssignmentId}
        wizardLevel={wizardPackage.level}
        contract={props.contract}
      />}
      <CharacterClassPanelBase {...props} />
    </>}
  </div>
}
