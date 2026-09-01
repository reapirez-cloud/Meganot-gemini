-- CLASS_INTEGRATION_STRICT: class:druid
-- CLASS_PACKAGE_TEST: tests/vossReferenceContract.test.ts
-- CLASS_WORK_STATUS: druid:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- PRESENTATION ONLY.
--
-- Production received the Druid-only Voss presentation hotfix under this exact
-- migration version before the repository history marker was written. Keep this
-- version in source so Supabase local/remote migration histories stay aligned.
--
-- The canonical reproducible implementation of the same three-layer narrator
-- contract (authorExplanation -> exact rule -> authorComment), including its
-- recursive patcher and regression gates, lives in:
--   20260829162500_voss_reference_voice_contract.sql
--
-- Fresh databases therefore use this row only as the production-history marker
-- and receive the canonical presentation update from the later migration.
-- No Character Engine mechanics are changed here.

select 1;
