-- Legacy class catalog reset.
-- Keep only the three class families currently being rebuilt/audited:
-- Fighter, Druid and Cleric.
--
-- IMPORTANT: custom/non-builtin templates are intentionally outside this cleanup.
-- In particular the historical test/easter-egg class "Жопка" has is_builtin=false
-- and must remain untouched.

DO $$
DECLARE
  assigned_count integer;
BEGIN
  SELECT count(*)
    INTO assigned_count
  FROM character_template_assignments assignment
  JOIN rule_templates template
    ON template.id = assignment.template_id
  LEFT JOIN rule_templates parent
    ON parent.id = template.parent_template_id
  WHERE (
      template.kind = 'class'
      AND template.is_builtin IS TRUE
      AND template.catalog_key NOT IN ('class:fighter', 'class:druid', 'class:cleric')
    )
    OR (
      template.kind = 'subclass'
      AND parent.kind = 'class'
      AND parent.is_builtin IS TRUE
      AND parent.catalog_key NOT IN ('class:fighter', 'class:druid', 'class:cleric')
    );

  IF assigned_count > 0 THEN
    RAISE EXCEPTION
      'Refusing legacy class cleanup: % character template assignment(s) still point at classes/subclasses scheduled for deletion',
      assigned_count;
  END IF;
END
$$;

-- Parent deletion is RESTRICT, while level rows/assignments cascade. Delete child
-- subclasses first, then the legacy builtin classes themselves.
DELETE FROM rule_templates subclass
USING rule_templates parent
WHERE subclass.kind = 'subclass'
  AND subclass.parent_template_id = parent.id
  AND parent.kind = 'class'
  AND parent.is_builtin IS TRUE
  AND parent.catalog_key NOT IN ('class:fighter', 'class:druid', 'class:cleric');

DELETE FROM rule_templates
WHERE kind = 'class'
  AND is_builtin IS TRUE
  AND catalog_key NOT IN ('class:fighter', 'class:druid', 'class:cleric');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM rule_templates
    WHERE kind = 'class'
      AND is_builtin IS TRUE
      AND catalog_key NOT IN ('class:fighter', 'class:druid', 'class:cleric')
  ) THEN
    RAISE EXCEPTION 'Legacy builtin classes remain after cleanup';
  END IF;
END
$$;
