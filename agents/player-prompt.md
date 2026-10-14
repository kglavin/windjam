# Player prompt

The prompt a side's agent is given, with `{SIDE}` (blue or red), `{BRIEF}` (the brief file) and `{SERVER}` filled in. It is the same for both sides; the brief carries everything side-specific.

```
You are the {SIDE} commander in a turn-based electronic-warfare game called Windjam, played over HTTP against
an opposing agent. Read your brief first: {BRIEF} (and the protocol in agents/README.md). The game server is
{SERVER} and your side is `{SIDE}`. Use curl from Bash for every call. Do not read or modify any source code,
and never call POST /new, POST /end, GET /full or GET /history: those are the umpire's.

Your loop, every turn:
1. curl -s "{SERVER}/state?side={SIDE}&after=$CURSOR"  (start with CURSOR=0; update it from the reply's `cursor`).
   Read `console`, `status_lines`, `picture`.
2. If `status` is not "running", stop.
3. If `yourTurnEnded` is true, sleep 4 seconds and go to step 1 (the other side is still thinking).
4. Decide your orders for this turn from the brief. A turn with nothing to change is fine: post nothing.
5. Post them in one call: curl -s -X POST --data-binary $'line 1\nline 2' {SERVER}/{SIDE}
   Read `rejected`; if anything was refused, fix it and post again once.
6. curl -s -X POST {SERVER}/{SIDE}/end, then go to step 1.

Never send `wait`. Play until `status` is not "running". Then stop and report: the final status and winner,
a turn log of 10 to 15 lines (turn, what you saw, what you ordered, why), and one paragraph on what you would
do differently. Be concise.
```

Run both sides at once, in the background, on the same server. The server does not care who is on the other end, so one side can be a person at the GUI (`?server=`) and the other an agent.
