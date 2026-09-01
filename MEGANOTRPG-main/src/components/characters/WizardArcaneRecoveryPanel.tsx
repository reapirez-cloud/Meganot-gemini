import { useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { ResolvedCharacterContract } from "../../character-engine/index.ts"
import { useAuth } from "../../context/AuthContext.tsx"
import { useCharacters } from "../../context/CharacterContext.tsx"
import { createEngineCommandContext } from "../../engine-contracts/index.ts"
import { oracle } from "../../oracle-engine/runtime.ts"
import { supabase } from "../../lib/supabase.ts"
import { runWizardArcaneRecovery, type SpellSlotRecoverySelection } from "../../lib/wizardArcaneRecovery.ts"
import SpellSlotRecoveryPicker from "./SpellSlotRecoveryPicker.tsx"
import "./WizardArcaneRecoveryPanel.css"

type Props = {
  characterId: string
  assignmentId: string
  wizardLevel: number
  contract: ResolvedCharacterContract
}

export default function WizardArcaneRecoveryPanel({ characterId, assignmentId, wizardLevel, contract }: Props) {
  const { user } = useAuth()
  const { characters, campaignId, canManage } = useCharacters()
  const character = characters.find((entry) => entry.id === characterId)
  const isAssignedPlayer = Boolean(character?.assigned_user_id && character.assigned_user_id === user.id)
  const resource = contract.resources.find((entry) => entry.stateKey === "wizard_arcane_recovery")
  const budget = Math.ceil(Math.max(1, wizardLevel) / 2)
  const [shortRestOpen, setShortRestOpen] = useState(false)
  const [loadingRest, setLoadingRest] = useState(true)
  const [selection, setSelection] = useState<SpellSlotRecoverySelection>({})
  const [busy, setBusy] = useState(false)
  const [restBusy, setRestBusy] = useState(false)
  const [error, setError] = useState("")

  async function loadRestState() {
    const { data, error: readError } = await supabase
      .from("character_short_rest_sessions")
      .select("is_open")
      .eq("character_id", characterId)
      .maybeSingle()
    if (!readError) setShortRestOpen(Boolean(data?.is_open))
    setLoadingRest(false)
  }

  useEffect(() => {
    let cancelled = false
    let channel: RealtimeChannel | null = null
    const load = async () => {
      const { data, error: readError } = await supabase
        .from("character_short_rest_sessions")
        .select("is_open")
        .eq("character_id", characterId)
        .maybeSingle()
      if (cancelled) return
      if (!readError) setShortRestOpen(Boolean(data?.is_open))
      setLoadingRest(false)
    }
    void load()
    channel = supabase.channel(`wizard-short-rest-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_short_rest_sessions", filter: `character_id=eq.${characterId}` }, () => void load())
      .subscribe()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [characterId])

  const selectedLevels = useMemo(() => Object.entries(selection)
    .reduce((sum, [level, amount]) => sum + Number(level) * Number(amount || 0), 0), [selection])
  const available = Number(resource?.current || 0) > 0
  const canSubmit = isAssignedPlayer && shortRestOpen && available && selectedLevels > 0 && selectedLevels <= budget && !busy

  async function grantShortRest() {
    if (!canManage || restBusy) return
    setRestBusy(true)
    setError("")
    try {
      await oracle.characters.recover(createEngineCommandContext({
        campaignId,
        requestedBy: user.id,
        authority: "gm",
        actorCharacterId: characterId,
      }), characterId, "short_rest")
      await loadRestState()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить короткий отдых.")
    } finally {
      setRestBusy(false)
    }
  }

  async function recover() {
    if (!canSubmit) return
    setBusy(true)
    setError("")
    const result = await runWizardArcaneRecovery(characterId, assignmentId, contract, selection)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelection({})
  }

  return <section className="wizard-arcane-recovery">
    <header>
      <div><small>1 уровень · Волшебник</small><strong>Магическое восстановление</strong></div>
      <span>{available ? "1 / 1" : "0 / 1"}</span>
    </header>
    <p>После короткого отдыха восстанови потраченные ячейки суммарным уровнем не больше <b>{budget}</b>. Ячейки 6 уровня и выше восстановить нельзя.</p>

    {canManage && !shortRestOpen && <button type="button" className="wizard-arcane-recovery__rest" disabled={restBusy} onClick={() => void grantShortRest()}>
      {restBusy ? "Завершаем отдых…" : "ГМ · Завершить короткий отдых"}
    </button>}

    {loadingRest ? <div className="wizard-arcane-recovery__notice">Проверяем состояние короткого отдыха…</div>
      : !shortRestOpen ? <div className="wizard-arcane-recovery__notice">Доступ откроется, когда ГМ завершит персонажу короткий отдых.</div>
      : !available ? <div className="wizard-arcane-recovery__notice">Магическое восстановление уже использовано. Вернётся после долгого отдыха.</div>
      : <SpellSlotRecoveryPicker
          contract={contract}
          budget={budget}
          maxSlotLevel={5}
          value={selection}
          disabled={!isAssignedPlayer || busy}
          onChange={setSelection}
        />}

    {shortRestOpen && available && <button type="button" className="wizard-arcane-recovery__commit" disabled={!canSubmit} onClick={() => void recover()}>
      {busy ? "Восстанавливаем…" : isAssignedPlayer ? "Восстановить выбранные ячейки" : "Решение принимает владелец персонажа"}
    </button>}
    {error && <div className="wizard-arcane-recovery__error">{error}</div>}
  </section>
}
