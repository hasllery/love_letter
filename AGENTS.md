# Working agreement

- Plan each milestone before code, then verify tests, typecheck, and lint.
- The user authorized continuing through M8 without milestone review pauses.
- Server owns state. Clients send validated intents only.
- Never expose deck, burn card, or another player's hand. Test personalized views.
- Engine is pure: inject seeded randomness; no I/O, sockets, clock, or global randomness.
- Strict TypeScript and shared contracts; no unexplained `any`.
- No unfinished stubs represented as complete. Report deferred work honestly.
- Original illustrations, branding, and ability wording only. Title lives in shared config.
- Ask about material rule ambiguity. Document interpretations in PLAN.md.
- Run the 10,000-game simulation and multiplayer browser tests before reporting completion.
