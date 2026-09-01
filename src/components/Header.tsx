import React from "react"
import {
  Shield,
  Dices,
  BookOpen,
  Sparkles,
  Layers,
  CheckCircle2,
  GitBranch,
  FileText,
  Swords,
  Scroll,
} from "lucide-react"
import type { ActiveTab } from "../types.ts"
import type { RpgCharacterPreset } from "../services/rpgBridge.ts"

interface HeaderProps {
  activeTab: ActiveTab
  onSelectTab: (tab: ActiveTab) => void
  characters: RpgCharacterPreset[]
  selectedCharacterId: string
  onSelectCharacter: (id: string) => void
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  characters,
  selectedCharacterId,
  onSelectCharacter,
}) => {
  const selectedChar = characters.find((c) => c.id === selectedCharacterId) || characters[0]

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: "sheet", label: "Лист (CE)", icon: <Shield className="w-4 h-4" /> },
    { id: "roller", label: "Кубы (TOBIK)", icon: <Dices className="w-4 h-4" /> },
    { id: "actions", label: "Действия", icon: <Swords className="w-4 h-4" /> },
    { id: "voss", label: "Голос Восса", icon: <BookOpen className="w-4 h-4" /> },
    { id: "spells", label: "Заклинания", icon: <Sparkles className="w-4 h-4" /> },
    { id: "engines", label: "8 Движков", icon: <Layers className="w-4 h-4" /> },
    { id: "tests", label: "Тесты (124)", icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: "patch", label: "Патч-лог", icon: <FileText className="w-4 h-4" /> },
  ]

  return (
    <header className="bg-stone-900 border-b border-stone-800 text-stone-100 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Top bar with system badges & character picker */}
        <div className="flex flex-wrap items-center justify-between py-3 gap-3 border-b border-stone-800/80">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Scroll className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-amber-400 text-lg uppercase font-mono">
                  MEGANOTRPG
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-mono border border-stone-700">
                  v2026.08
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Исполняемый ролевой движок • 8 Архитектурных плоскостей
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Git Branch Discipline Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-800/80 rounded-md text-xs text-emerald-300 font-mono">
              <GitBranch className="w-3.5 h-3.5" />
              <span>dev</span>
              <span className="text-stone-400 font-normal">|</span>
              <span className="text-emerald-400 font-semibold">2026-08-31-A [OPEN]</span>
            </div>

            {/* Character Selector */}
            <div className="flex items-center gap-1 bg-stone-800/90 p-1 rounded-md border border-stone-700">
              <span className="text-xs text-stone-400 px-1.5 hidden sm:inline">Герой:</span>
              {characters.map((char) => {
                const isActive = char.id === selectedCharacterId
                return (
                  <button
                    key={char.id}
                    id={`char-picker-${char.id}`}
                    onClick={() => onSelectCharacter(char.id)}
                    className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                      isActive
                        ? "bg-amber-500 text-stone-950 shadow-sm"
                        : "text-stone-300 hover:bg-stone-700 hover:text-white"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-stone-900/30 flex items-center justify-center text-[10px] font-bold">
                      {char.avatarLetter}
                    </span>
                    <span>{char.name.split(" ")[0]}</span>
                    <span className="opacity-70 text-[10px]">({char.level})</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom tab navigation */}
        <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-thin">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
