# Decisions

This document is just to track some decisions made for KevBot.

1. The authentication workflow will result in 401 status code if a user is not logged in. A side effect will be red errors in the console, which happens when fetch does not return a 200 status code. This is expected behavior and will not be "fixed".

## 2026-10-15 — Full legacy bot parity contract accepted

The owner accepted D1–D11, the permission matrix, and playback/reporting semantics
in [the bot parity contract](specs/bot-parity-decisions.md), without changes.
[Owner approval](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658).

This preserves the full 18-command/prefix release boundary and resolves legacy/API
differences explicitly, including duration/name limits, ranking, shared-library
permissions, identity delegation and per-guild playback overlap. The accepted
specification is the source of truth; do not duplicate or reinterpret its rules
in individual implementation tickets.

This is design acceptance only. API/bot implementation and verification remain
in #157–#163; test-guild acceptance and production cutover remain separate gates.
Future changes to the accepted behavior require an explicit reviewed decision.
