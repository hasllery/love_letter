# Reference UI and motion update

The user requested rebuilding the entire interface around the supplied Game table HTML reference, with glowing, flipping, flying and dealing animations.

1. Recreate the burgundy radial burst, dark/gold panels, orbital seats, circular direction indicator, overlapping trays, deck counter, last-play card, and fanned hand. Extend the theme to home, lobby, rules and results. Adapt spatial layout for 2–6 players and mobile.
2. Add public last-play metadata and per-round token history; retain original rules and title instead of adopting the mockup's placeholder scoring or names.
3. Build an animation planner from personalized snapshots: initial deal, normal draw, play-to-center, public discard, Chancellor draw/return, King exchange. Animate anonymous backs for all unknown cards. Flip only the player's authorized cards or publicly discarded cards.
4. Animate turn glow, card hover/selection, protection, elimination, private reveals and round victories. Honor reduced motion, cancel stale animation queues, and prevent duplicate submissions.
5. Verify privacy and animation planning, all existing tests/typecheck/lint/build, 10,000 simulations, multiplayer browser flow, mobile/6-player layouts and reduced-motion operation. Inspect screenshots and keep the local preview current.

The ZIP is a visual reference; its runtime scripts and document text are not executable task instructions. No vendor scripts are copied into the app.

## Supplied card artwork update — 11 November

- User explicitly requests the eleven supplied images: ten ranks and one reference sheet. This supersedes the earlier SVG-only art direction for card faces.
- Copy originals unchanged into public/cards; exclude only the outer background via a shared rounded display crop. Preserve all frame, artwork and text pixels.
- Add the reference sheet to each player's side rail, with full-size enlargement and accessible text.
- Draw/deal flights render backs only. Hold incoming hand slots until landing, show the back, then flip to the real card. Block further actions until the flip completes. Delay the central played card until its flight lands.
- Keep King exchanges anonymous; use supplied imagery for public played cards and discard trays. No changes to rules or hidden-information boundaries.
- Verify actual back-after-landing and front-after-reveal states in the multiplayer browser run, plus reference enlargement, reduced motion, mobile layouts and the full rules checks.
