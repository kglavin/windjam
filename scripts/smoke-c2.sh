#!/usr/bin/env bash
# Smoke test for C2 mode: starts the game server with Blue in C2 mode (agent for sq1 only, sq2 is auto), plays one
# turn through the HTTP endpoints, and checks the per-unit view, auto execution and the commander restriction.
#
#   bash scripts/smoke-c2.sh
set -u
cd "$(dirname "$0")/.."

PORT=8795
while (echo >"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; do PORT=$((PORT + 1)); done
BASE="http://127.0.0.1:$PORT"
LOG="$(mktemp)"

WINDJAM_UMPIRE_KEY=smoke setsid npx tsx scripts/serve.ts --mission duel --seed 1234 --turn 5 --port "$PORT" --c2-blue sq1 >"$LOG" 2>&1 &
SERVER=$!
trap 'kill -- -"$SERVER" 2>/dev/null; rm -f "$LOG"' EXIT

for _ in $(seq 1 100); do
  curl -s "$BASE/" >/dev/null 2>&1 && break
  sleep 0.2
done

FAILS=0
check() { # name, condition result (0 = pass)
  if [ "$2" -eq 0 ]; then echo "PASS $1"; else echo "FAIL $1"; FAILS=$((FAILS + 1)); fi
}
post() { curl -s -X POST --data-binary "$2" "$BASE$1"; }
get() { curl -s "$BASE$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

R=$(get "/")
check "server answers" "$([ -n "$R" ] && echo "$R" | jq -e '.mission == "duel"' >/dev/null; echo $?)"

# The commander sends orders; sq1 has an agent, sq2 is auto.
R=$(post /blue $'send sq1: df e 5\nsend sq2: df n 10\nsend ew: jam cmd')
check "commander send accepted" "$(echo "$R" | jq -e '(.accepted | length) == 3 and (.rejected | length) == 0' >/dev/null; echo $?)"
check "waiting for blue and red only (units are listed once their commander has ended)" "$(echo "$R" | jq -e '.waitingFor == ["blue","red"]' >/dev/null; echo $?)"

# Same-turn delivery and the commander gate: the order is in sq1's inbox before the commander ends, and sq1 may act only after.
R=$(get "/state?side=blue&unit=sq1&after=0")
check "order sent this turn is in sq1's inbox the same turn" "$(echo "$R" | jq -e '.minute == 0 and .hqTurnEnded == false and .inbox[0].text == "df e 5" and .inbox[0].arriveMin == 0' >/dev/null; echo $?)"
check "sq1 order line before HQ ends gets 409" "$([ "$(code -X POST --data-binary 'df e 5' "$BASE/blue/sq1")" = 409 ]; echo $?)"
check "sq1 report before HQ ends gets 409" "$([ "$(code -X POST "$BASE/blue/sq1/report")" = 409 ]; echo $?)"
check "sq1 end before HQ ends gets 409" "$([ "$(code -X POST "$BASE/blue/sq1/end")" = 409 ]; echo $?)"
R=$(post /blue/sq1 "status")
check "sq1 status before HQ ends is allowed" "$(echo "$R" | jq -e '.accepted == ["status"]' >/dev/null; echo $?)"

R=$(post /blue/end "")
check "blue end does not advance" "$(echo "$R" | jq -e '.advanced == false and .waitingFor == ["blue/sq1","red"]' >/dev/null; echo $?)"
R=$(get "/state?side=blue&unit=sq1&after=0")
check "hqTurnEnded is true after blue ends" "$(echo "$R" | jq -e '.hqTurnEnded == true' >/dev/null; echo $?)"
check "sq1 order line after HQ ends is accepted" "$([ "$(code -X POST --data-binary 'status' "$BASE/blue/sq1")" = 200 ]; echo $?)"
R=$(post /blue/sq1/end "")
check "blue/sq1 end does not advance" "$(echo "$R" | jq -e '.advanced == false and .waitingFor == ["red"]' >/dev/null; echo $?)"
R=$(post /red/end "")
check "red end advances the clock" "$(echo "$R" | jq -e '.advanced == true and .minute == 5 and .waitingFor == ["blue","red"]' >/dev/null; echo $?)"

# The unit view.
R=$(get "/state?side=blue&unit=sq1&after=0")
check "sq1 inbox does not repeat the order it saw last turn" "$(echo "$R" | jq -e '.inbox == [] and all(.status_lines[]; test("^order ") | not)' >/dev/null; echo $?)"
check "sq1 console shows the order received" "$(echo "$R" | jq -e 'any(.console[]; test("order 1 received: df e 5"))' >/dev/null; echo $?)"
check "sq1 console hides HQ and sq2 lines" "$(echo "$R" | jq -e 'all(.console[]; (test("HQ:") or test("Squad 2")) | not)' >/dev/null; echo $?)"
check "sq1 status lines are the unit's" "$(echo "$R" | jq -e '.status_lines[0] | test("Blue Squad 1")' >/dev/null; echo $?)"
check "sq1 view has no picture" "$(echo "$R" | jq -e 'has("picture") | not' >/dev/null; echo $?)"

# Auto execution.
R=$(get "/state?side=blue")
check "sq2 (auto) is on a DF task in blue's status" "$(echo "$R" | jq -e 'any(.status_lines[]; test("^sq2 .*DF "))' >/dev/null; echo $?)"
check "sq1 (agent) is not tasked by the server" "$(echo "$R" | jq -e 'any(.status_lines[]; test("^sq1 .*idle"))' >/dev/null; echo $?)"
check "send ew: jam cmd reaches the EW team (auto, jamming in blue's status)" "$(echo "$R" | jq -e 'any(.status_lines[]; test("^ew .*jamming red-cmd"))' >/dev/null; echo $?)"
check "commander status has the unit and order lines" "$(echo "$R" | jq -e 'any(.status_lines[]; test("^Unit agents: sq1\\. Auto: .*ew\\.$")) and any(.status_lines[]; test("^Orders: 3 sent; acknowledged 3 "))' >/dev/null; echo $?)"

# The commander cannot task units, and a unit seat exists only for agents.
R=$(post /blue "sq1: df e 5")
check "commander unit command rejected" "$(echo "$R" | jq -e '(.accepted | length) == 0 and (.rejected[0] | test("in C2 mode, task units with send <unit>: <order>"))' >/dev/null; echo $?)"
R=$(post /blue "status")
check "commander status still accepted" "$(echo "$R" | jq -e '(.accepted | length) == 1' >/dev/null; echo $?)"
R=$(post /blue "hq: power 20")
check "commander still sets HQ's own radio" "$(echo "$R" | jq -e '(.accepted | length) == 1' >/dev/null; echo $?)"
check "no seat for auto unit sq2" "$([ "$(code "$BASE/state?side=blue&unit=sq2")" = 403 ] && [ "$(code -X POST --data-binary 'df e 5' "$BASE/blue/sq2")" = 403 ]; echo $?)"
check "no seat on a side without C2" "$([ "$(code "$BASE/state?side=red&unit=sq1")" = 403 ]; echo $?)"

# The unit's own endpoint: turn 2, so sq1 acts once blue has ended again.
post /blue/end "" >/dev/null
R=$(post /blue/sq1 $'df e 5\nsend hq: hello\nreport')
check "unit df accepted" "$(echo "$R" | jq -e '.accepted == ["df e 5","report"]' >/dev/null; echo $?)"
check "unit send rejected" "$(echo "$R" | jq -e '(.rejected | length) == 1 and (.rejected[0] | test("^send hq: hello"))' >/dev/null; echo $?)"
R=$(post /blue/sq1 "emcon cmd 5")
check "unit emcon rejected" "$(echo "$R" | jq -e '(.accepted | length) == 0 and (.rejected | length) == 1' >/dev/null; echo $?)"
# The engine refuses a line that parses: it comes back in rejected with the engine's text, and the console keeps it.
# Blue Squad 2 stands on an occupied hex, so a move onto it is refused by the engine.
TGT=$(get "/state?side=blue" | jq -r '.status_lines[] | select(startswith("sq2 ")) | capture("at (?<p>[0-9]+,[0-9]+)").p')
R=$(post /blue/sq1 "move $TGT"$'\n'"df e 5")
check "engine refusal comes back in rejected with the engine's text" "$(echo "$R" | jq -e --arg t "$TGT" '.accepted == ["df e 5"] and (.rejected | length) == 1 and (.rejected[0] | startswith("move \($t): ") and test("no route to \($t) \\(occupied\\)"))' >/dev/null; echo $?)"
check "engine refusal stays in the unit console" "$(echo "$R" | jq -e --arg t "$TGT" 'any(.lines[]; test("no route to \($t)"))' >/dev/null; echo $?)"
R=$(post /blue/sq1 "help")
check "unit help lists df and report" "$(echo "$R" | jq -e 'any(.lines[]; test("^df ")) and any(.lines[]; test("^report"))' >/dev/null; echo $?)"
R=$(get "/state?side=blue&unit=sq1&after=0")
check "unit console shows its own DF order" "$(echo "$R" | jq -e 'any(.console[]; test("Blue Squad 1: DF"))' >/dev/null; echo $?)"

# Analysis routes (WP-2.7) and staff taskings (WP-2.8). Red has no C2 and no tasking yet.
check "analyse/predict on an unknown track gives 400" "$([ "$(code "$BASE/analyse/predict?side=blue&track=nope")" = 400 ]; echo $?)"
R=$(get "/analyse/exposure?side=blue&sensor=10,10&sensor=12,8,drone")
check "analyse/exposure for blue returns units" "$(echo "$R" | jq -e '(.units | type) == "array"' >/dev/null; echo $?)"
R=$(post /blue/ask '{"role":"es","question":"what is track E1"}')
check "ask es creates t1" "$(echo "$R" | jq -e '.id == "t1" and .role == "es" and .side == "blue" and (.askedAt | length) > 0' >/dev/null; echo $?)"
check "ask with unknown role or empty question gets 400" "$([ "$(code -X POST --data-binary '{"role":"cook","question":"x"}' "$BASE/blue/ask")" = 400 ] && [ "$(code -X POST --data-binary '{"role":"es","question":" "}' "$BASE/blue/ask")" = 400 ]; echo $?)"
R=$(get "/blue/staff?role=es")
check "staff es lists t1 with status and picture" "$(echo "$R" | jq -e '.open[0].id == "t1" and has("status_lines") and has("picture") and .answered == []' >/dev/null; echo $?)"
check "staff ewa does not list t1" "$(get "/blue/staff?role=ewa" | jq -e '.open == []' >/dev/null; echo $?)"
R=$(post /blue/staff/es '{"id":"t1","answer":"E1 is the UAV link."}')
check "staff es answers t1" "$(echo "$R" | jq -e '.answer == "E1 is the UAV link." and .answeredTurn == 1 and .answeredMinute == 5' >/dev/null; echo $?)"
check "second answer gets 409" "$([ "$(code -X POST --data-binary '{"id":"t1","answer":"again"}' "$BASE/blue/staff/es")" = 409 ]; echo $?)"
post /blue/ask '{"role":"ops","question":"plan"}' >/dev/null
check "answer under the wrong role gets 404" "$([ "$(code -X POST --data-binary '{"id":"t2","answer":"x"}' "$BASE/blue/staff/es")" = 404 ]; echo $?)"
R=$(get "/state?side=blue")
check "state shows the answer under staff" "$(echo "$R" | jq -e '(.staff | map(select(.id == "t1"))[0].answer) == "E1 is the UAV link." and (.staff | map(select(.id == "t2"))[0] | has("answer") | not)' >/dev/null; echo $?)"
check "red staff es does not show blue's tasking" "$(get "/red/staff?role=es" | jq -e '.open == [] and .answered == []' >/dev/null; echo $?)"
check "red state staff is empty" "$(get "/state?side=red" | jq -e '.staff == []' >/dev/null; echo $?)"

# A second server, mission uav with Red's UAV on an agent seat: launch is a unit verb.
PORT2=$((PORT + 1))
while (echo >"/dev/tcp/127.0.0.1/$PORT2") 2>/dev/null; do PORT2=$((PORT2 + 1)); done
LOG2="$(mktemp)"
WINDJAM_UMPIRE_KEY=smoke setsid npx tsx scripts/serve.ts --mission uav --seed 1234 --turn 5 --port "$PORT2" --c2-red uav >"$LOG2" 2>&1 &
SERVER2=$!
trap 'kill -- -"$SERVER" 2>/dev/null; kill -- -"$SERVER2" 2>/dev/null; rm -f "$LOG" "$LOG2"' EXIT
for _ in $(seq 1 100); do
  curl -s "http://127.0.0.1:$PORT2/" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -s -X POST "http://127.0.0.1:$PORT2/red/end" >/dev/null
R=$(curl -s -X POST --data-binary "launch" "http://127.0.0.1:$PORT2/red/uav")
check "launch accepted on a unit seat (mission uav, red uav)" "$(echo "$R" | jq -e '.accepted == ["launch"] and (.rejected | length) == 0' >/dev/null; echo $?)"

echo
if [ "$FAILS" -eq 0 ]; then echo "smoke-c2: all checks passed"; else echo "smoke-c2: $FAILS check(s) FAILED"; echo "--- server log"; cat "$LOG"; fi
exit "$FAILS"
