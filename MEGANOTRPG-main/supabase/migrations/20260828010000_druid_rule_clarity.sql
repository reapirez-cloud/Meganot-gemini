begin;

-- Keep the machine-readable rule and the human-facing feature text equally precise.
-- This patches every installed built-in Druid without exposing catalog revision history in UI.
update public.rule_template_levels l
set mechanics = coalesce((
  select jsonb_agg(
    case m->>'id'
      when 'druid-wild-resurgence' then
        jsonb_set(
          m,
          '{payload,description}',
          to_jsonb('Если запас Дикой формы равен 0, один раз на каждом своём ходу можно без действия потратить одну ячейку любого уровня и вернуть ровно 1 использование Дикой формы. Уровень ячейки не влияет на обмен. В обратную сторону без действия тратится 1 использование Дикой формы и восстанавливается 1 ячейка 1 уровня; такой обратный обмен доступен 1 раз до долгого отдыха.'::text),
          true
        )
      when 'druid-elemental-fury' then
        jsonb_set(
          m,
          '{payload,description}',
          to_jsonb('Один раз выбирается одна ветка. Могущественные заклинания добавляют модификатор Мудрости к урону любого заговора друида. Первобытный удар один раз на каждом своём ходу при попадании оружием или атакой зверя в Дикой форме добавляет 1к8 урона холодом, огнём, молнией или громом.'::text),
          true
        )
      when 'druid-improved-elemental-fury' then
        jsonb_set(
          m,
          '{payload,description}',
          to_jsonb('Автоматически усиливает ветку, выбранную на 7 уровне. Могущественные заклинания увеличивают дальность подходящего заговора друида на 300 футов; Первобытный удар вместо 1к8 наносит 2к8 дополнительного стихийного урона.'::text),
          true
        )
      when 'druid-archdruid' then
        jsonb_set(
          m,
          '{payload,description}',
          to_jsonb('Если при броске инициативы Дикая форма равна 0, возвращается 1 использование. Раз за долгий отдых можно без действия превратить оставшиеся использования Дикой формы в одну ячейку: каждое использование даёт 2 уровня ячейки. При обычном запасе из двух форм это максимум одна ячейка 4 уровня. Старение замедляется в десять раз.'::text),
          true
        )
      else m
    end
    order by ord
  )
  from jsonb_array_elements(l.mechanics) with ordinality as e(m, ord)
), '[]'::jsonb)
from public.rule_templates t
where t.id = l.template_id
  and t.catalog_key = 'class:druid'
  and t.is_builtin
  and l.level in (5, 7, 15, 20);

commit;
