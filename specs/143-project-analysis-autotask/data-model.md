# Project analysis and AutoTask models

`Feature.discovery` records a stable semantic key, evidence paths and the analysis date. `ProjectAnalysisSummary` records readable-file coverage and the number of newly imported capabilities. Migration 175 adds JSON provenance to features and analysis metadata to the existing project map record. The same map lease prevents overlapping classification and source analysis.

`Feature.autoTask` stores the opt-in, an optional originating feature ID, a durable plan and the last planning error. Each plan has stable child UUIDs, topologically ordered tasks, all prerequisite IDs and a readiness flag. Migration 176 adds JSON state and a cross-process planning lease. A worker cannot claim an enabled AutoTask until its plan is ready. A draft survives failed initialization, so retry reuses child identities and does not call the planner again.
