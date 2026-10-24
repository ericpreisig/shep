## Problem Statement
Shep cannot chat with Codex, join multiple feature dependencies, redirect running work from the web UI, or browse the entire project by semantic topic. The daemon health probe lacks local web authentication.

## Success Criteria
- Authenticated health probe returns actual readiness without exposing its token.
- Codex chats support streamed responses, multiple turns, session resumption and cancellation.
- A feature waits for every parent; parents can be edited before it starts; cycles and cross-repository edges are refused.
- Completed parents supply their summaries and artifacts to the dependent agent.
- A running feature can be interrupted and resumed with a durable user correction from the web UI.
- A separate mind map menu covers all project tasks, including archived tasks, and links their chats.
- AI can rebuild the complete nested taxonomy as new tasks arrive; dependencies are never rendered as thematic links.
- Collapsed topics, search, loading, empty and error states remain usable.

## Affected Areas
Domain contracts, feature persistence and scheduling, interactive agents, project navigation and graph UI.

## Size Estimate
XL: coordinated behavior across application, infrastructure and presentation layers.