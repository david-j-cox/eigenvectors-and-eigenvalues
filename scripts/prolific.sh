#!/usr/bin/env bash
# ============================================================
# Thin wrapper over the Prolific API.
#
# The token is read from the macOS Keychain at the moment of the
# call and never written to a file, a variable that outlives the
# command, or the terminal. Store it once with:
#
#   security add-generic-password -a prolific -s prolific-api -w "$(pbpaste)" -U
#
# which takes the token from the clipboard, so the value itself
# never appears in a command line, in shell history, or in a
# transcript.
#
# Usage:
#   ./prolific.sh whoami                 # confirm the token works
#   ./prolific.sh balance                # funds; available_balance gates publishing
#   ./prolific.sh workspaces             # workspace ids
#   ./prolific.sh projects <ws-id>       # project ids within a workspace
#   ./prolific.sh studies                # existing studies
#   ./prolific.sh create study.json      # create an UNPUBLISHED draft
#   ./prolific.sh get <study-id>
#   ./prolific.sh cost <study-id>        # what publishing would charge
#   ./prolific.sh publish <study-id>     # SPENDS MONEY, prompts first
#   ./prolific.sh submissions <study-id>
# ============================================================
set -euo pipefail

API="https://api.prolific.com/api/v1"
ACCOUNT="prolific"
SERVICE="prolific-api"

token() {
  security find-generic-password -a "$ACCOUNT" -s "$SERVICE" -w 2>/dev/null
}

# Checked from the main shell rather than inside token(). An `exit` there runs
# in the command substitution's subshell and does not stop the script, so a
# missing token would otherwise be sent as an empty header and come back as a
# confusing 404 instead of a clear message.
require_token() {
  if ! security find-generic-password -a "$ACCOUNT" -s "$SERVICE" -w >/dev/null 2>&1; then
    echo "No Prolific token in the Keychain." >&2
    echo "Copy the token from Prolific (Settings -> API tokens), then run:" >&2
    echo '  security add-generic-password -a prolific -s prolific-api -w "$(pbpaste)" -U' >&2
    exit 1
  fi
}

# Token goes in via a header file on stdin so it never appears in the process
# list, where any other user on the machine could read it from `ps`.
call() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "$API$path"
              -H @/dev/stdin
              -H "Content-Type: application/json"
              -w '\n%{http_code}')
  [ -n "$body" ] && args+=(-d "$body")
  printf 'Authorization: Token %s' "$(token)" | curl "${args[@]}"
}

# Splits curl's trailing status code off the body and fails loudly on non-2xx,
# so a 401 or a validation error cannot be mistaken for an empty result.
run() {
  local out code
  out="$(call "$@")"
  code="${out##*$'\n'}"
  out="${out%$'\n'*}"
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "HTTP $code" >&2
    echo "$out" | (jq . 2>/dev/null || cat) >&2
    exit 1
  fi
  echo "$out" | (jq . 2>/dev/null || cat)
}

cmd="${1:-}"; shift || true
case "$cmd" in
  ""|-h|--help|help)
    sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac

require_token

case "$cmd" in
  whoami)      run GET /users/me/ ;;
  # There is no /balance/ endpoint; funds live on the user record, and the
  # figure that governs whether a study can publish is available_balance.
  # Both are in cents, and available_balance can be negative.
  balance)     run GET /users/me/ | jq '{currency_code, balance, available_balance,
                                         fees_percentage}' ;;
  workspaces)  run GET /workspaces/ | jq '[.results[] | {id, title}]' ;;
  projects)
    [ -n "${1:-}" ] || { echo "usage: prolific.sh projects <workspace-id>" >&2; exit 1; }
    run GET "/workspaces/$1/projects/" | jq '[.results[] | {id, title}]' ;;
  studies)     run GET /studies/ | jq '[.results[] | {id, name, status}]' ;;
  get)         run GET "/studies/$1/" ;;
  cost)        run GET "/studies/$1/cost/" ;;
  submissions) run GET "/studies/?study=$1" ;;

  create)
    [ -f "${1:-}" ] || { echo "usage: prolific.sh create <study.json>" >&2; exit 1; }
    jq empty "$1" || { echo "$1 is not valid JSON" >&2; exit 1; }
    run POST /studies/ "$(cat "$1")"
    ;;

  publish)
    # The only call here that spends money and exposes the study to
    # participants. Everything else is reversible; this is not.
    id="${1:-}"
    [ -n "$id" ] || { echo "usage: prolific.sh publish <study-id>" >&2; exit 1; }
    echo "About to PUBLISH study $id." >&2
    run GET "/studies/$id/" | jq '{name, status, total_available_places,
                                   reward, estimated_completion_time,
                                   external_study_url}' >&2
    read -r -p "Type the study id again to confirm: " confirm
    [ "$confirm" = "$id" ] || { echo "Not confirmed; nothing published." >&2; exit 1; }
    run POST "/studies/$id/transition/" '{"action":"PUBLISH"}'
    ;;

  *)
    echo "unknown command: $cmd" >&2
    sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 1
    ;;
esac
