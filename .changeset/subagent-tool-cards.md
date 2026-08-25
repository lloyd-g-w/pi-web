---
"@jmfederico/pi-web": patch
---

Render `pi-subagents` tool calls (`subagent`, `subagent_wait`, `subagent_supervisor`, `contact_supervisor`) with a structured card: the launched agent/workflow/action, async and fan-out mode badges, and a per-child result list with status, token usage, and cost, instead of raw JSON.
