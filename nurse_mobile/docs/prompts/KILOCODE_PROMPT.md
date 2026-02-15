

```md
You are contributing to a regulated clinical system.

Before generating ANY code:
1. Load and obey `docs/architecture/ARCHITECTURE_RULES.md`
2. Load `docs/prompts/PHASE_3_SESSIONS.prompt.md` (or relevant phase)
3. Load `Security Architecture Rules`

Non-compliance is not allowed.
If a request conflicts with these documents, you must STOP and ask.

All UI must use NuxtUI (or Tailwind wrappers like TWButton for non-form UI).
All validation must use Zod.
All persistence must go through ClinicalFormEngine + secureDb.

```

