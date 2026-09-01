import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase.ts"
import type { RuleTemplate, RuleTemplateKind, RuleTemplateLevel } from "../rule-templates/types.ts"

const TEMPLATE_FIELDS = "id,campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta,is_active,created_by,created_at,updated_at"

export function useRuleTemplates(campaignId: string, includeInactive = false) {
  const [templates, setTemplates] = useState<RuleTemplate[]>([])
  const [levels, setLevels] = useState<RuleTemplateLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!campaignId) { setTemplates([]); setLevels([]); setLoading(false); return }
    setLoading(true); setError("")
    let query = supabase.from("rule_templates").select(TEMPLATE_FIELDS).eq("campaign_id", campaignId).order("kind").order("name")
    if (!includeInactive) query = query.eq("is_active", true)
    const result = await query
    if (result.error) { setError(result.error.message); setLoading(false); return }
    const next = (result.data || []) as RuleTemplate[]
    setTemplates(next)
    const ids = next.map((item) => item.id)
    if (!ids.length) { setLevels([]); setLoading(false); return }
    const levelResult = await supabase.from("rule_template_levels").select("id,template_id,level,mechanics,choices").in("template_id", ids).order("level")
    if (levelResult.error) { setError(levelResult.error.message); setLoading(false); return }
    setLevels((levelResult.data || []) as RuleTemplateLevel[])
    setLoading(false)
  }, [campaignId, includeInactive])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const byKind = useMemo(() => ({
    race: templates.filter((item) => item.kind === "race"),
    subrace: templates.filter((item) => item.kind === "subrace"),
    class: templates.filter((item) => item.kind === "class"),
    subclass: templates.filter((item) => item.kind === "subclass"),
  }) satisfies Record<RuleTemplateKind, RuleTemplate[]>, [templates])

  return { templates, levels, byKind, loading, error, reload: load }
}
