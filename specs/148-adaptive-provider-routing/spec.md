## Problem Statement
The adaptive tier menus only list the default provider catalog. A previously stored foreign model renders blank, and model-only routing cannot switch executors.

## Success Criteria
- Reuse AgentModelPicker to offer all provider catalogs and searchable models for all tiers.
- Always display stored model IDs, including models missing from the current catalog.
- Persist provider/model together, support returning a tier to derived, and keep legacy overrides compatible.
- Resolve the correct provider credentials and executor for sequential batches and parallel tasks; never combine identical model IDs across providers.
- Preserve native profiles, feature context, space agent restrictions, final validation and current default selection.
- Verify targeted tests, actual fork picker and provider routing, then publish on main.
