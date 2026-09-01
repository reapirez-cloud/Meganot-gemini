import React, { useState } from "react"
import { Header } from "./components/Header.tsx"
import { CharacterSheetView } from "./components/CharacterSheetView.tsx"
import { DiceRollerView } from "./components/DiceRollerView.tsx"
import { ActionsView } from "./components/ActionsView.tsx"
import { VossReferenceView } from "./components/VossReferenceView.tsx"
import { SpellCatalogView } from "./components/SpellCatalogView.tsx"
import { EnginesArchitectureView } from "./components/EnginesArchitectureView.tsx"
import { TestSuiteView } from "./components/TestSuiteView.tsx"
import { PatchLogView } from "./components/PatchLogView.tsx"
import {
  INITIAL_CHARACTERS,
  executeRollAction,
  performRestAction,
  type RpgCharacterPreset,
} from "./services/rpgBridge.ts"
import type { ActiveTab, RollLogEntry } from "./types.ts"
import { Shield, GitBranch, Terminal, Cpu } from "lucide-react"

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("sheet")
  const [characters, setCharacters] = useState<RpgCharacterPreset[]>(INITIAL_CHARACTERS)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("char-eleonora")
  const [rollHistory, setRollHistory] = useState<RollLogEntry[]>([
    {
      id: "initial-roll",
      title: "Проверка: Внимательность (Элеонора)",
      formula: "1d20+7",
      total: 21,
      diceResults: [14],
      modifier: 7,
      rollMode: "normal",
      timestamp: "12:00:00",
      detail: "14 + 7 = 21",
    },
  ])

  const activePreset =
    characters.find((c) => c.id === selectedCharacterId) || characters[0]

  // Handlers
  const handleQuickRoll = (title: string, formula: string, modifier: number = 0) => {
    const entry = executeRollAction(title, formula, "normal", modifier)
    setRollHistory((prev) => [entry, ...prev.slice(0, 24)])
    // Switch to roller tab to inspect result
    setActiveTab("roller")
  }

  const handleExecuteRoll = (
    title: string,
    formula: string,
    mode: "normal" | "advantage" | "disadvantage",
    modifier?: number
  ) => {
    const entry = executeRollAction(title, formula, mode, modifier)
    setRollHistory((prev) => [entry, ...prev.slice(0, 24)])
  }

  const handleClearHistory = () => {
    setRollHistory([])
  }

  const handleUpdateHp = (charId: string, delta: number) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== charId) return c
        const current = c.input.state.currentHp ?? c.input.attributes.constitution * 3
        const max = 55 // safety cap
        const updated = Math.max(0, Math.min(max, current + delta))
        return {
          ...c,
          input: {
            ...c.input,
            state: {
              ...c.input.state,
              currentHp: updated,
            },
          },
        }
      })
    )
  }

  const handleSpendResource = (charId: string, resourceKey: string, amount: number) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== charId) return c
        const currentResources = c.input.state.resources || {}
        const currentVal = currentResources[resourceKey]?.current ?? 0
        const updatedVal = Math.max(0, currentVal - amount)

        return {
          ...c,
          input: {
            ...c.input,
            state: {
              ...c.input.state,
              resources: {
                ...currentResources,
                [resourceKey]: {
                  ...currentResources[resourceKey],
                  current: updatedVal,
                },
              },
            },
          },
        }
      })
    )
  }

  const handleRest = (charId: string, restType: "short_rest" | "long_rest") => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== charId) return c
        const updatedInput = performRestAction(c.input, restType)
        return {
          ...c,
          input: updatedInput,
        }
      })
    )
  }

  const handleExecuteAction = (
    actionKey: string,
    actionLabel: string,
    costs: Array<{ key: string; amount: number }>,
    diceFormula: string
  ) => {
    // 1. Deduct resources
    costs.forEach((cost) => {
      handleSpendResource(activePreset.id, cost.key, cost.amount)
    })

    // 2. Roll effect/damage
    if (diceFormula && diceFormula !== "0" && !diceFormula.includes("Спасбросок")) {
      handleExecuteRoll(`Действие: ${actionLabel}`, diceFormula, "normal")
    } else {
      const entry: RollLogEntry = {
        id: `act-${Date.now()}`,
        title: `Действие: ${actionLabel}`,
        formula: diceFormula,
        total: 0,
        diceResults: [],
        modifier: 0,
        rollMode: "normal",
        timestamp: new Date().toLocaleTimeString(),
        detail: "Ресурс списан, эффект наложен",
      }
      setRollHistory((prev) => [entry, ...prev.slice(0, 24)])
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Universal Engine Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        characters={characters}
        selectedCharacterId={selectedCharacterId}
        onSelectCharacter={setSelectedCharacterId}
      />

      {/* Main Workspace Area */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {activeTab === "sheet" && (
          <CharacterSheetView
            preset={activePreset}
            onQuickRoll={handleQuickRoll}
            onUpdateHp={handleUpdateHp}
            onSpendResource={handleSpendResource}
            onRest={handleRest}
          />
        )}

        {activeTab === "roller" && (
          <DiceRollerView
            preset={activePreset}
            rollHistory={rollHistory}
            onExecuteRoll={handleExecuteRoll}
            onClearHistory={handleClearHistory}
          />
        )}

        {activeTab === "actions" && (
          <ActionsView
            preset={activePreset}
            onExecuteAction={handleExecuteAction}
          />
        )}

        {activeTab === "voss" && <VossReferenceView />}

        {activeTab === "spells" && <SpellCatalogView />}

        {activeTab === "engines" && <EnginesArchitectureView />}

        {activeTab === "tests" && <TestSuiteView />}

        {activeTab === "patch" && <PatchLogView />}
      </main>

      {/* Persistent System Status Bar */}
      <footer className="border-t border-stone-800/80 bg-stone-900/90 py-3 px-4 sm:px-6 text-xs text-stone-400">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-stone-300 font-semibold">MEGANOTRPG Dev Environment</span>
            <span className="text-stone-600">|</span>
            <span>Дисциплина ветки: dev</span>
            <span className="text-stone-600">|</span>
            <span className="text-amber-400/90">Патч 2026-08-31-A [OPEN]</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="hidden md:inline text-stone-500">
              Движки: CE • GENA • ORACLE • TOBIK • CHEBURASHKA • SHAPOKLYAK • LARISA • CHASOVOY
            </span>
            <span className="text-emerald-400">Синхронизация: OK</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
