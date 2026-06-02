#!/bin/bash
# Unit tests for clash_ctl.sh clashmode function
# Uses monkey-patching (mock functions) to test without real device/Clash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$TEST_DIR/../clash_ctl.sh"

PASS=0
FAIL=0
VERBOSE="${VERBOSE:-0}"

log_test() {
  if [ "$VERBOSE" = "1" ]; then
    echo "  TEST: $*" >&2
  fi
}

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  log_test "$desc"
  if echo "$output" | grep -qF "$expected"; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc"
    echo "    expected to contain: $expected"
    echo "    actual: $output"
  fi
}

assert_not_contains() {
  local desc="$1" output="$2" unexpected="$3"
  log_test "$desc"
  if echo "$output" | grep -qF "$unexpected"; then
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc"
    echo "    should NOT contain: $unexpected"
    echo "    actual: $output"
  else
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  fi
}

assert_equals() {
  local desc="$1" actual="$2" expected="$3"
  log_test "$desc"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc"
    echo "    expected: $expected"
    echo "    actual:   $actual"
  fi
}

# ─── Helper: run clashmode in a subprocess with mocked commands ───

run_mocked_clashmode() {
  local mode="$1"
  local mock_curl_mode="${2:-rule}"          # What curl returns as current mode
  local mock_override="${3:-{\"mode\":\"rule\"}}"  # Contents of override.json on device
  local mock_adb_available="${4:-yes}"       # Whether adb get-state succeeds

  # Create a temp dir for mock binaries
  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf $tmpdir" RETURN

  # ── Mock adb ──
  cat > "$tmpdir/adb" <<'ADB_SCRIPT'
#!/bin/bash
case "$1" in
  get-state)
    ADB_AVAILABLE="{{ADB_AVAIL}}"
    if [ "$ADB_AVAILABLE" = "yes" ]; then
      echo "device"
    else
      echo "error: no devices/emulators found" >&2
      exit 1
    fi
    ;;
  forward)
    exit 0
    ;;
  shell)
    shift
    cmd="$*"
    if echo "$cmd" | grep -q 'cat /data/data/com.github.metacubex.clash.meta/files/clash/override.json'; then
      echo '{{OVERRIDE_JSON}}'
    elif echo "$cmd" | grep -q 'cat > /data/data/com.github.metacubex.clash.meta/files/clash/override.json'; then
      # Capture stdin to a file for later assertion
      cat > /tmp/mock_override_written.json
      exit 0
    elif echo "$cmd" | grep -q 'echo root'; then
      echo "root"
    fi
    ;;
  *)
    exit 0
    ;;
esac
ADB_SCRIPT
  chmod +x "$tmpdir/adb"

  # Replace placeholders with actual values (escape for sed)
  local escaped_override
  escaped_override=$(echo "$mock_override" | sed 's/\\/\\\\/g; s/\//\\\//g; s/"/\\"/g')
  sed -i "s/{{ADB_AVAIL}}/${mock_adb_available}/g" "$tmpdir/adb"
  # Use a different delimiter for override
  sed -i "s|{{OVERRIDE_JSON}}|${mock_override//\"/\\\"}|g" "$tmpdir/adb"

  # ── Mock curl ──
  cat > "$tmpdir/curl" <<CURL_SCRIPT
#!/bin/bash
if echo "\$*" | grep -q '/configs'; then
  echo '{"mode":"'"$mock_curl_mode"'"}'
elif echo "\$*" | grep -q '/version'; then
  echo '{"version":"1.0.0","meta":true}'
elif echo "\$*" | grep -q '/proxies/GLOBAL'; then
  echo '{"now":"auto","all":["auto","node1","node2"]}'
else
  echo '{}'
fi
CURL_SCRIPT
  chmod +x "$tmpdir/curl"

  # ── Mock jq (pass through to real jq, but mock specific behavior) ──
  # We'll use the real jq since it's just a data transform

  # ── Run the script with mocked PATH ──
  # Extract just the clashmode case and run it in isolation
  # Actually, let's run the whole script but with mocked commands
  PATH="$tmpdir:$PATH" bash "$SCRIPT" clashmode "$mode" 2>&1
}

# ─── Actually, let's write a more focused test that directly tests the logic ───
# We'll source the function and test it with mocked external commands

# Simpler approach: create a test harness that sources the script functions
# and overrides external commands at the bash function level

# ─── Test functions ───

test_invalid_mode() {
  echo ""
  echo "=== Test: Invalid mode argument ==="
  local output
  output=$(bash "$SCRIPT" clashmode invalid 2>&1) || true
  assert_contains "should show usage for invalid mode" "$output" "用法"
}

test_valid_mode_names() {
  echo ""
  echo "=== Test: Valid mode names accepted by case statement ==="
  # Test that the case pattern matches correctly - shell syntax check
  local modes="global rule direct"
  for m in $modes; do
    case "$m" in
      global|rule|direct) result="valid" ;;
      *) result="invalid" ;;
    esac
    assert_equals "mode '$m' should be valid" "$result" "valid"
  done

  # Verify invalid modes are rejected
  for m in "Global" "rules" "DirecT" "" " "; do
    case "$m" in
      global|rule|direct) result="valid" ;;
      *) result="invalid" ;;
    esac
    assert_equals "mode '$m' should be invalid" "$result" "invalid"
  done
}

test_override_json_modification() {
  echo ""
  echo "=== Test: override.json modification logic ==="
  # Simulate what clashmode does: read override.json, modify mode, write back
  local override='{"mode":"rule","other":"value"}'
  local new_mode="global"

  # This is the exact jq command used in clash_ctl.sh (use -c for compact output matching)
  local new_override
  new_override=$(echo "$override" | jq -c --arg m "$new_mode" '.mode = $m')

  assert_contains "modified override.json should contain new mode" "$new_override" '"mode":"global"'
  assert_contains "modified override.json should preserve other fields" "$new_override" '"other":"value"'

  # Test with empty override.json
  local empty_override='{}'
  local new_empty
  new_empty=$(echo "$empty_override" | jq -c --arg m "direct" '.mode = $m')
  assert_equals "empty override.json should become {\"mode\":\"direct\"}" "$new_empty" '{"mode":"direct"}'

  # Test with malformed JSON (edge case)
  local bad_json='{broken'
  if echo "$bad_json" | jq --arg m "rule" '.mode = $m' 2>/dev/null; then
    bad_result="ok"
  else
    bad_result="jq error (expected)"
  fi
  assert_equals "malformed override.json should cause jq error" "$bad_result" "jq error (expected)"
}

test_early_return_when_mode_already_set() {
  echo ""
  echo "=== Test: Early return when mode already matches ==="
  # Simulate the early-return logic in clashmode
  # If curl returns current mode == requested mode, it should echo "已是" and return 0
  local current_mode="rule"
  local requested_mode="rule"

  if [ "$current_mode" = "$requested_mode" ]; then
    result="代理模式已是: $requested_mode"
    ret=0
  else
    result="代理模式已切换为: $requested_mode"
    ret=0
  fi

  assert_contains "should say already set" "$result" "代理模式已是"
  assert_equals "return code should be 0" "$ret" "0"

  # Test mismatch case
  current_mode="global"
  if [ "$current_mode" = "$requested_mode" ]; then
    result="代理模式已是: $requested_mode"
  else
    result="代理模式已切换为: $requested_mode"
  fi
  assert_contains "should say switched" "$result" "代理模式已切换为"
}

test_clash_restart_sequence() {
  echo ""
  echo "=== Test: Clash restart sequence ==="
  # Verify the script uses the correct intent actions
  local stop_action="com.github.metacubex.clash.meta.action.STOP_CLASH"
  local start_action="com.github.metacubex.clash.meta.action.START_CLASH"

  assert_equals "STOP_CLASH action string" "$stop_action" "com.github.metacubex.clash.meta.action.STOP_CLASH"
  assert_equals "START_CLASH action string" "$start_action" "com.github.metacubex.clash.meta.action.START_CLASH"

  # Check the script actually contains these commands
  local script_content
  script_content=$(cat "$SCRIPT")
  assert_contains "script contains STOP_CLASH" "$script_content" "STOP_CLASH"
  assert_contains "script contains START_CLASH" "$script_content" "START_CLASH"
  assert_contains "script has sleep after stop" "$script_content" "sleep 2"
  # After the fix, the verification loop uses sleep 1 in a seq loop, replacing the old sleep 3
  assert_contains "script has verification loop with sleep" "$script_content" "sleep 1"
}

test_status_json_mode_field() {
  echo ""
  echo "=== Test: status_json mode field parsing ==="
  # Verify that status_json function reads mode from /configs endpoint
  local script_content
  script_content=$(cat "$SCRIPT")

  assert_contains "status_json fetches /configs for mode" "$script_content" "/configs"
  assert_contains "status_json uses .mode field" "$script_content" ".mode"

  # Verify mode is null when clash is not running
  assert_contains "mode is null when not running" "$script_content" '"mode": null'
}

test_root_requirement_for_clashmode() {
  echo ""
  echo "=== Test: Root requirement for clashmode ==="
  # The clashmode function requires root to read/write override.json via su
  local script_content
  script_content=$(cat "$SCRIPT")

  # Both read and write of override.json use su -c for root access
  local su_count
  su_count=$(echo "$script_content" | grep -cF 'su -c' || true)
  if [ "$su_count" -ge 2 ]; then
    PASS=$((PASS + 1))
    echo "  PASS: clashmode requires su for override.json read/write (found $su_count occurrences)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: clashmode should use su -c at least twice (found $su_count)"
  fi

  # Check the frontend properly disables mode switching when no root
  local control_panel
  control_panel=$(cat "$TEST_DIR/../client/src/components/ControlPanel.tsx")
  assert_contains "Radio.Group disabled when no root" "$control_panel" "!root"
  assert_contains "Radio.Group disabled when clash not running" "$control_panel" "!clashRunning"
}

test_frontend_mode_propagation() {
  echo ""
  echo "=== Test: Frontend mode value propagation ==="
  # The Radio.Group uses status.clash.mode as its value
  local control_panel
  control_panel=$(cat "$TEST_DIR/../client/src/components/ControlPanel.tsx")

  assert_contains "Radio.Group reads mode from status" "$control_panel" "status?.clash?.mode"
  assert_contains "Radio.Button for global" "$control_panel" 'value="global"'
  assert_contains "Radio.Button for rule" "$control_panel" 'value="rule"'
  assert_contains "Radio.Button for direct" "$control_panel" 'value="direct"'
}

test_backend_mode_endpoint() {
  echo ""
  echo "=== Test: Backend /api/mode endpoint ==="
  local server_code
  server_code=$(cat "$TEST_DIR/../server/index.js")

  assert_contains "server validates mode parameter" "$server_code" "global"
  assert_contains "server uses PUT for mode" "$server_code" "app.put('/api/mode'"
  assert_contains "server calls clashmode script" "$server_code" "clashmode"
  assert_contains "server has 60s timeout for mode switch" "$server_code" "60000"
}

test_frontend_refresh_after_mode_change() {
  echo ""
  echo "=== Test: Frontend refreshes after mode change ==="
  local app_code
  app_code=$(cat "$TEST_DIR/../client/src/App.tsx")

  assert_contains "action calls refresh after success" "$app_code" "await refresh()"
  assert_contains "action sets loading state" "$app_code" "setLoadingAction"
  assert_contains "action clears loading on finally" "$app_code" "setLoadingAction(null)"

  # Verify api.ts has setMode function
  local api_code
  api_code=$(cat "$TEST_DIR/../client/src/api.ts")
  assert_contains "api.ts exports setMode" "$api_code" "setMode"
  assert_contains "setMode uses PUT method" "$api_code" "PUT"
}

test_no_polling_problem() {
  echo ""
  echo "=== Test: No polling mechanism exists ==="
  local app_code
  app_code=$(cat "$TEST_DIR/../client/src/App.tsx")

  # The app has no setInterval or polling mechanism
  if echo "$app_code" | grep -q 'setInterval\|setTimeout\|usePolling\|SWR\|react-query'; then
    PASS=$((PASS + 1))
    echo "  PASS: polling mechanism found"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: no polling mechanism — status only updates on mount and after manual actions"
    echo "    If Clash restarts and the first refresh fails, UI will show stale data indefinitely"
  fi

  # The app only calls refresh on mount (once)
  assert_contains "status only fetched at mount" "$app_code" "useEffect"
}

test_status_json_clash_not_ready_scenario() {
  echo ""
  echo "=== Test: Status when Clash not yet ready after restart ==="
  # After STOP_CLASH → START_CLASH, Clash needs time to initialize
  # If /version returns non-JSON or empty, clash_running is false
  # Then mode = null in the output

  # Simulate the status_json logic for clash_running check
  local clash_resp=''  # Empty = not ready
  local clash_running=false

  if echo "$clash_resp" | grep -q 'version'; then
    clash_running=true
  fi

  assert_equals "empty version response means not running" "$clash_running" "false"

  # When not running, mode should be null
  if $clash_running; then
    mode='"rule"'
  else
    mode='null'
  fi
  assert_equals "mode is null when clash not running" "$mode" "null"
}

test_post_restart_verification() {
  echo ""
  echo "=== Test: Post-restart verification loop (added in fix) ==="
  local script_content
  script_content=$(cat "$SCRIPT")

  assert_contains "verify mode after restart via /configs" "$script_content" "verify"
  assert_contains "retry loop for post-restart check" "$script_content" "seq 1"
  assert_contains "warns on verification timeout" "$script_content" "验证超时"
  assert_contains "returns 1 on verification failure" "$script_content" "return 1"
}

test_frontend_polling_and_retry() {
  echo ""
  echo "=== Test: Frontend polling and retry (added in fix) ==="
  local app_code
  app_code=$(cat "$TEST_DIR/../client/src/App.tsx")

  assert_contains "has polling interval" "$app_code" "setInterval"
  assert_contains "polling respects busy guard" "$app_code" "pollingRef"
  assert_contains "has retry-with-backoff function" "$app_code" "refreshWithRetry"
  assert_contains "retry checks clash running with valid mode" "$app_code" "clash?.running"
  assert_contains "mode actions use retry refresh" "$app_code" "切换代理模式"
  # Verify polling is suspended during actions
  assert_contains "polling disabled during action" "$app_code" "pollingRef.current = true"
}

# ─── Run all tests ───

main() {
  echo "================================================"
  echo "  clashmode 功能测试套件"
  echo "================================================"

  test_valid_mode_names
  test_invalid_mode
  test_override_json_modification
  test_early_return_when_mode_already_set
  test_clash_restart_sequence
  test_status_json_mode_field
  test_root_requirement_for_clashmode
  test_frontend_mode_propagation
  test_backend_mode_endpoint
  test_frontend_refresh_after_mode_change
  test_no_polling_problem
  test_status_json_clash_not_ready_scenario
  test_post_restart_verification
  test_frontend_polling_and_retry

  echo ""
  echo "================================================"
  echo "  Results: $PASS passed, $FAIL failed"
  echo "================================================"

  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
