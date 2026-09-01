import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { Character } from "../context/CharacterContext.tsx"
import {
  CharacterRuntimeResolveError,
  type CharacterRuntimeResolveErrorCode,
  type CharacterRuntimeSnapshot,
} from "../engine-runtime/characterRuntimeResolver.ts"
import { characterRuntimeResolver } from "../engine-runtime/characterRuntime.ts"
import { characterResolutionBus } from "../engine-runtime/characterResolutionBus.ts"
import { watchCheburashkaCharacter } from "../inventory-engine/runtime.ts"
import type { CharacterPreparationModel } from "../lib/characterPreparation.ts"
import { supabase } from "../lib/supabase.ts"
import type { ResourceSyncInput } from "../types/characterResources.ts"
import { useCharacterResourceStates } from "./useCharacterResourceStates.ts"
import { useCharacterTemplateRegistry } from "./useCharacterTemplateRegistry.ts"

export type CharacterRuntimeStatus = "idle" | "loading" | "ready" | "stale" | "error"

const EMPTY_PREPARATION: CharacterPreparationModel = {
  session: null,
  tasks: [],
  suppressedSourceIds: [],
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? String(value)
}

function resourceSyncKey(resources: ResourceSyncInput[]) {
  return stableJson(resources.map((item) => ({
    stateKey: item.stateKey,
    max: item.max,
    label: item.label,
    recharge: item.recharge,
  })))
}

/**
 * Owns the actual character source loaders and resolver lifecycle.
 * Presentation consumers should call useResolvedCharacterRuntime(), which
 * reuses the nearest CharacterRuntimeProvider instead of creating another
 * template/resource loader tree.
 */
function useOwnedResolvedCharacterRuntime(character: Character | null) {
  const characterId = character?.id || null
  const templates = useCharacterTemplateRegistry(characterId)
  const resources = useCharacterResourceStates(characterId)
  const {
    bundles: templateBundles,
    error: templateError,
    loading: templateLoading,
    reload: reloadTemplates,
    suppressions,
  } = templates
  const {
    error: resourceError,
    loading: resourceLoading,
    rows: resourceRows,
    state: resourceState,
    sync: syncResources,
  } = resources

  const [snapshot, setSnapshot] = useState<CharacterRuntimeSnapshot | null>(null)
  const snapshotRef = useRef<CharacterRuntimeSnapshot | null>(null)
  const resourceSyncInFlightRef = useRef<string | null>(null)
  const [status, setStatus] = useState<CharacterRuntimeStatus>(characterId ? "loading" : "idle")
  const [error, setError] = useState("")
  const [errorCode, setErrorCode] = useState<CharacterRuntimeResolveErrorCode | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    setStatus(snapshotRef.current ? "stale" : "loading")
    setRevision((value) => value + 1)
  }, [])

  const rowByKey = useMemo(
    () => new Map(resourceRows.map((row) => [row.state_key, row])),
    [resourceRows],
  )

  useEffect(() => {
    snapshotRef.current = null
    resourceSyncInFlightRef.current = null
    setSnapshot(null)
    setError("")
    setErrorCode(null)
    setWarnings([])
    setStatus(characterId ? "loading" : "idle")
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    return characterResolutionBus.subscribe(characterId, refresh)
  }, [characterId, refresh])

  useEffect(() => {
    if (!character?.campaign_id) return
    return characterResolutionBus.subscribeCampaign(character.campaign_id, refresh)
  }, [character?.campaign_id, refresh])

  useEffect(() => {
    if (!characterId) return
    return watchCheburashkaCharacter(characterId)
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase
      .channel(`character-runtime-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_sheets", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_spells", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_features", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_sessions", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_records", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_template_assignments", filter: `character_id=eq.${characterId}` }, () => {
        void reloadTemplates().finally(refresh)
      })
      .subscribe()

    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [characterId, refresh, reloadTemplates])

  useEffect(() => {
    let cancelled = false

    if (!character) {
      snapshotRef.current = null
      setSnapshot(null)
      setStatus("idle")
      setError("")
      setErrorCode(null)
      return () => { cancelled = true }
    }

    if (templateLoading || resourceLoading) {
      setStatus(snapshotRef.current ? "stale" : "loading")
      return () => { cancelled = true }
    }

    const sourceError = templateError || resourceError
    if (sourceError) {
      setError(sourceError)
      setErrorCode("read_failed")
      setStatus("error")
      return () => { cancelled = true }
    }

    setStatus(snapshotRef.current ? "stale" : "loading")
    setError("")
    setErrorCode(null)

    void characterRuntimeResolver.resolve({
      character,
      templateBundles,
      resourceState,
      suppressedSourceIds: suppressions.sourceIds,
    }).then(async (next) => {
      if (cancelled) return

      snapshotRef.current = next
      setSnapshot(next)
      setWarnings(next.warnings)
      setStatus("ready")

      const needsSync = next.resourceSyncInputs.some((item) => {
        const row = rowByKey.get(item.stateKey)
        return !row ||
          row.max_snapshot !== item.max ||
          row.label !== item.label ||
          stableJson(row.recharge) !== stableJson(item.recharge)
      })

      if (!needsSync) return

      const syncKey = resourceSyncKey(next.resourceSyncInputs)
      if (resourceSyncInFlightRef.current === syncKey) return
      resourceSyncInFlightRef.current = syncKey
      const result = await syncResources(next.resourceSyncInputs)
      if (resourceSyncInFlightRef.current === syncKey) resourceSyncInFlightRef.current = null
      if (cancelled || result.ok) return
      setWarnings((current) => [...new Set([
        ...current,
        result.error || "Не удалось синхронизировать persistent-ресурсы персонажа.",
      ])])
    }).catch((reason) => {
      if (cancelled) return
      const runtimeError = reason instanceof CharacterRuntimeResolveError ? reason : null
      setError(runtimeError?.message || (reason instanceof Error ? reason.message : "Не удалось рассчитать персонажа."))
      setErrorCode(runtimeError?.code || "resolve_failed")
      setStatus("error")
    })

    return () => { cancelled = true }
  }, [
    character,
    resourceError,
    resourceLoading,
    resourceState,
    revision,
    rowByKey,
    suppressions.sourceIds,
    syncResources,
    templateBundles,
    templateError,
    templateLoading,
  ])

  return {
    snapshot,
    contract: snapshot?.contract || null,
    preparation: snapshot?.preparation || EMPTY_PREPARATION,
    status,
    loading: status === "loading",
    stale: status === "stale" || (status === "error" && Boolean(snapshot)),
    error,
    errorCode,
    warnings,
    refresh,
    templates,
    resources,
  }
}

export type ResolvedCharacterRuntime = ReturnType<typeof useOwnedResolvedCharacterRuntime>

const CharacterRuntimeContext = createContext<ResolvedCharacterRuntime | null>(null)

export function CharacterRuntimeProvider({ value, children }: { value: ResolvedCharacterRuntime; children: ReactNode }) {
  return createElement(CharacterRuntimeContext.Provider, { value }, children)
}

/**
 * Shared React adapter over CharacterRuntimeResolver.
 *
 * Frame/route owns the runtime once. Nested Sheet/Class/Profile consumers reuse
 * that exact instance. Outside a provider the hook remains a valid standalone
 * owner for Chat and other routes that mount their own character runtime.
 */
export function useResolvedCharacterRuntime(character: Character | null) {
  const shared = useContext(CharacterRuntimeContext)
  const owned = useOwnedResolvedCharacterRuntime(shared ? null : character)
  return shared || owned
}
