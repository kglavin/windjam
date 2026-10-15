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
check "waiting for blue, blue/sq1 and red" "$(echo "$R" | jq -e '.waitingFor == ["blue","blue/sq1","red"]' >/dev/null; echo $?)"

R=$(post /blue/end "")
check "blue end does not advance" "$(echo "$R" | jq -e '.advanced == false and .waitingFor == ["blue/sq1","red"]' >/dev/null; echo $?)"
R=$(post /blue/sq1/end "")
check "blue/sq1 end does not advance" "$(echo "$R" | jq -e '.advanced == false and .waitingFor == ["red"]' >/dev/null; echo $?)"
R=$(post /red/end "")
check "red end advances the clock" "$(echo "$R" | jq -e '.advanced == true and .minute == 5 and .waitingFor == ["blue","blue/sq1","red"]' >/dev/null; echo $?)"

# The unit view.
R=$(get "/state?side=blue&unit=sq1&after=0")
check "sq1 inbox shows the order" "$(echo "$R" | jq -e '.inbox[0].text == "df e 5" and .inbox[0].n == 1' >/dev/null; echo $?)"
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

# The unit's own endpoint.
R=$(post /blue/sq1 $'df e 5\nsend hq: hello\nreport')
check "unit df accepted" "$(echo "$R" | jq -e '.accepted == ["df e 5","report"]' >/dev/null; echo $?)"
check "unit send rejected" "$(echo "$R" | jq -e '(.rejected | length) == 1 and (.rejected[0] | test("^send hq: hello"))' >/dev/null; echo $?)"
R=$(post /blue/sq1 "emcon cmd 5")
check "unit emcon rejected" "$(echo "$R" | jq -e '(.accepted | length) == 0 and (.rejected | length) == 1' >/dev/null; echo $?)"
R=$(post /blue/sq1 "help")
check "unit help lists df and report" "$(echo "$R" | jq -e 'any(.lines[]; test("^df ")) and any(.lines[]; test("^report"))' >/dev/null; echo $?)"
R=$(get "/state?side=blue&unit=sq1&after=0")
check "unit console shows its own DF order" "$(echo "$R" | jq -e 'any(.console[]; test("Blue Squad 1: DF"))' >/dev/null; echo $?)"

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
R=$(curl -s -X POST --data-binary "launch" "http://127.0.0.1:$PORT2/red/uav")
check "launch accepted on a unit seat (mission uav, red uav)" "$(echo "$R" | jq -e '.accepted == ["launch"] and (.rejected | length) == 0' >/dev/null; echo $?)"

echo
if [ "$FAILS" -eq 0 ]; then echo "smoke-c2: all checks passed"; else echo "smoke-c2: $FAILS check(s) FAILED"; echo "--- server log"; cat "$LOG"; fi
exit "$FAILS"
