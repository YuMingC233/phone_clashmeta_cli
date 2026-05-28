#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi
SECRET="${SECRET:-7355608*}"
PROXY_HOST="${PROXY_HOST:-172.19.0.1}"
PROXY_PORT="${PROXY_PORT:-7698}"

# 等待 adb 设备就绪，最多等 10 秒
ensure_device() {
  for i in $(seq 1 10); do
    if adb get-state 1>/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "错误: 未检测到 adb 设备" >&2
  return 1
}

# 清理并重建 Clash API 端口转发
fwd_clash() {
  adb forward --remove tcp:9090 2>/dev/null
  adb forward tcp:9090 tcp:9090 1>/dev/null 2>&1
}

# 输出 JSON 格式的状态信息 (供 Web UI 调用)
status_json() {
  has_device=false
  if ensure_device 2>/dev/null; then
    has_device=true
  fi

  # 数据流量
  md_val=false
  if $has_device; then
    md=$(adb shell settings get global mobile_data 2>/dev/null | tr -d '\r\n ')
    [ "$md" = "1" ] && md_val=true
  fi

  # 热点
  hs_val=false
  if $has_device && adb shell dumpsys wifi 2>/dev/null | grep -q 'curState=StartedState'; then
    hs_val=true
  fi

  # USB 网络共享
  usb_val=false
  if $has_device; then
    usb_func=$(adb shell getprop sys.usb.config 2>/dev/null | tr -d '\r\n ')
    echo "$usb_func" | grep -q 'rndis' && usb_val=true
  fi

  # Clash 状态
  clash_running=false
  clash_mode="null"
  clash_node="null"
  if $has_device; then
    fwd_clash 2>/dev/null
    clash_resp=$(curl -s "http://127.0.0.1:9090/version" -H "Authorization: Bearer $SECRET" 2>/dev/null)
    if echo "$clash_resp" | grep -q 'version'; then
      clash_running=true
      clash_mode=$(curl -s "http://127.0.0.1:9090/configs" -H "Authorization: Bearer $SECRET" 2>/dev/null | jq -r '.mode // "unknown"' 2>/dev/null)
      clash_node=$(curl -s "http://127.0.0.1:9090/proxies/GLOBAL" -H "Authorization: Bearer $SECRET" 2>/dev/null | jq -r '.now // "unknown"' 2>/dev/null)
    fi
  fi

  # 系统代理
  proxy_val=false
  if [ "$(gsettings get org.gnome.system.proxy mode 2>/dev/null)" = "'manual'" ]; then
    proxy_val=true
  fi

  # Google 联通 (通过代理)
  google_reachable=false
  google_latency="null"
  result=$(curl -x "http://${PROXY_HOST}:${PROXY_PORT}" \
    -s -o /dev/null -w '%{http_code} %{time_total}' \
    --connect-timeout 3 --max-time 5 \
    http://www.google.com 2>/dev/null)
  http_code=$(echo "$result" | cut -d' ' -f1)
  latency=$(echo "$result" | cut -d' ' -f2)
  if [ "$http_code" = "200" ] || [ "$http_code" = "301" ] || [ "$http_code" = "302" ]; then
    google_reachable=true
    google_latency=$latency
  fi

  # Root 权限
  root_val=false
  if $has_device && adb shell "su -c 'echo root'" 2>/dev/null | grep -q 'root'; then
    root_val=true
  fi

  # 输出 JSON
  printf '{\n'
  printf '  "device": %s,\n' "$has_device"
  printf '  "mobileData": %s,\n' "$md_val"
  printf '  "hotspot": %s,\n' "$hs_val"
  printf '  "usb": %s,\n' "$usb_val"
  printf '  "clash": {\n'
  printf '    "running": %s,\n' "$clash_running"
  printf '    "mode": %s,\n' "$clash_mode"
  printf '    "currentNode": %s\n' "$clash_node"
  printf '  },\n'
  printf '  "system": {\n'
  printf '    "proxy": %s,\n' "$proxy_val"
  printf '    "googleReachable": %s,\n' "$google_reachable"
  printf '    "googleLatency": %s\n' "$google_latency"
  printf '  },\n'
  printf '  "root": %s\n' "$root_val"
  printf '}\n'
}

# 执行单个命令
run_action() {
  case $1 in
    # ─── Clash 控制 ───
    clashon)
      ensure_device || return 1
      adb shell am start -a com.github.metacubex.clash.meta.action.START_CLASH
      echo "Clash 已启动"
      ;;
    clashoff)
      ensure_device || return 1
      adb shell am start -a com.github.metacubex.clash.meta.action.STOP_CLASH
      echo "Clash 已关闭"
      ;;
    node)
      ensure_device || return 1
      [ -z "$2" ] && { echo "用法: phone node <节点名> [代理组]"; return 1; }
      group="${3:-GLOBAL}"
      fwd_clash
      curl -s -X PUT "http://127.0.0.1:9090/proxies/${group}" \
        -H "Authorization: Bearer $SECRET" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$2\"}"
      echo "已切换到节点: $2 (组: $group)"
      ;;
    nodes)
      ensure_device || return 1
      fwd_clash
      curl -s "http://127.0.0.1:9090/proxies/GLOBAL" \
        -H "Authorization: Bearer $SECRET" \
        | jq '{now: .now, all: .all}'
      ;;
    clashmode)
      ensure_device || return 1
      mode="$2"
      case "$mode" in
        global|rule|direct) ;;
        *) echo "用法: phone clashmode <global|rule|direct>"; return 1 ;;
      esac
      fwd_clash
      current=$(curl -s "http://127.0.0.1:9090/configs" -H "Authorization: Bearer $SECRET" 2>/dev/null | jq -r '.mode')
      if [ "$current" = "$mode" ]; then
        echo "代理模式已是: $mode"
        return 0
      fi
      echo '正在更改代理模式...'
      # Read override.json, modify locally, write back via su
      override=$(adb shell "su -c 'cat /data/data/com.github.metacubex.clash.meta/files/clash/override.json'" 2>/dev/null)
      new_override=$(echo "$override" | jq --arg m "$mode" '.mode = $m')
      echo "$new_override" | adb shell "su -c 'cat > /data/data/com.github.metacubex.clash.meta/files/clash/override.json'" 2>/dev/null
      # Restart Clash to apply mode change
      adb shell am start -a com.github.metacubex.clash.meta.action.STOP_CLASH 1>/dev/null 2>&1
      sleep 2
      adb shell am start -a com.github.metacubex.clash.meta.action.START_CLASH 1>/dev/null 2>&1
      sleep 3
      echo "代理模式已切换为: $mode (已重启 Clash)"
      ;;

    # ─── 手机设置 ───
    mbdopen)
      ensure_device || return 1
      val=$(adb shell settings get global mobile_data 2>/dev/null | tr -d '\r\n ')
      if [ "$val" = "1" ]; then
        echo "流量已开启"
        return 1
      fi
      adb shell settings put global mobile_data 1
      echo "流量已打开"
      ;;
    hspopen)
      ensure_device || return 1
      if adb shell dumpsys wifi 2>/dev/null | grep -q 'curState=StartedState'; then
        echo "热点已开启"
        return 1
      fi
      ssid=$(adb shell dumpsys wifi 2>/dev/null | grep -oP 'ssid = "\K[^"]+' | head -1)
      if [ -z "$ssid" ]; then
        echo "未检测到已配置的热点 SSID，请先在手机 WiFi 设置中配置热点"
        return 1
      fi
      # Escape for su -c double-quoted context: backslash, double-quote, backtick, $
      esc_ssid=$(echo "$ssid" | sed 's/\\/\\\\/g; s/"/\\"/g; s/`/\\`/g; s/\$/\\$/g')
      adb shell "su -c \"cmd wifi start-softap \\\"${esc_ssid}\\\" open\""
      echo "热点已打开: $ssid"
      ;;
    usbon)
      ensure_device || return 1
      adb shell svc usb setFunctions rndis
      echo "USB网络共享已打开"
      ;;
    usboff)
      ensure_device || return 1
      adb shell svc usb setFunctions mtp
      echo "USB网络共享已关闭"
      ;;
    mute)
      ensure_device || return 1
      adb shell cmd media_session volume --stream 3 --set 0
      echo "手机已静音"
      ;;

    # ─── 本机系统代理 ───
    gsyson)
      gsettings set org.gnome.system.proxy mode 'manual' 2>/dev/null
      gsettings set org.gnome.system.proxy.http host "$PROXY_HOST" 2>/dev/null
      gsettings set org.gnome.system.proxy.http port "$PROXY_PORT" 2>/dev/null
      gsettings set org.gnome.system.proxy.https host "$PROXY_HOST" 2>/dev/null
      gsettings set org.gnome.system.proxy.https port "$PROXY_PORT" 2>/dev/null
      gsettings set org.gnome.system.proxy.socks host "$PROXY_HOST" 2>/dev/null
      gsettings set org.gnome.system.proxy.socks port "$PROXY_PORT" 2>/dev/null
      echo "本机代理已打开 (http/socks5://$PROXY_HOST:$PROXY_PORT)"
      ;;
    gsysoff)
      gsettings set org.gnome.system.proxy mode 'none' 2>/dev/null
      unsetproxy
      echo "本机代理已关闭"
      ;;

    # ─── 组合命令 ───
    booton)
      run_action mbdopen
      run_action usbon
      run_action clashon
      run_action gsyson
      run_action mute
      ;;
    tempon)
      run_action clashon
      run_action gsyson
      ;;
    tempoff)
      run_action clashoff
      run_action gsysoff
      ;;

    # ─── 信息 ───
    help|--help|-h)
      cat <<'HELP'
phone — Clash Meta 手机控制脚本

用法: phone <命令> [参数]

┌─ Clash 控制 ────────────────────────────────────┐
│ clashon           启动 Clash                     │
│ clashoff          停止 Clash                     │
│ node <节点> [组]  切换代理节点 (默认组: GLOBAL)  │
│ nodes             列出 GLOBAL 组节点             │
│ clashmode <模式>  切换代理模式 (global|rule|direct) │
└─────────────────────────────────────────────────┘

┌─ 手机设置 ──────────────────────────────────────┐
│ mbdopen           打开手机数据流量               │
│ hspopen           打开手机 WiFi 热点             │
│ usbon             开启 USB 网络共享              │
│ usboff            关闭 USB 网络共享              │
│ mute              手机静音                       │
└─────────────────────────────────────────────────┘

┌─ 本机系统代理 ──────────────────────────────────┐
│ gsyson            开启本机系统代理               │
│ gsysoff           关闭本机系统代理               │
└─────────────────────────────────────────────────┘

┌─ 组合命令 ──────────────────────────────────────┐
│ booton            mbdopen+usbon+clashon+gsyson+mute │
│ tempon            clashon+gsyson                 │
│ tempoff           clashoff+gsysoff               │
└─────────────────────────────────────────────────┘

┌─ 信息 ──────────────────────────────────────────┐
│ status            查看当前状态                   │
│ help              显示此帮助                     │
└─────────────────────────────────────────────────┘
HELP
      ;;
    status)
      if [ "$2" = "--json" ]; then
        status_json
        return 0
      fi
      echo "📱 手机状态"

      # ─ 数据流量
      if ensure_device 2>/dev/null; then
        md=$(adb shell settings get global mobile_data 2>/dev/null | tr -d '\r\n ')
        [ "$md" = "1" ] && echo "├── 数据流量: 开" || echo "├── 数据流量: 关"

        # ─ 热点
        if adb shell dumpsys wifi 2>/dev/null | grep -q 'curState=StartedState'; then
          echo "├── 热点: 开"
        else
          echo "├── 热点: 关"
        fi

        # ─ USB 网络共享
        usb_func=$(adb shell getprop sys.usb.config 2>/dev/null | tr -d '\r\n ')
        if echo "$usb_func" | grep -q 'rndis'; then
          echo "├── USB网络共享: 开"
        else
          echo "├── USB网络共享: 关"
        fi

        # ─ Clash 状态
        echo "├── Clash"
        fwd_clash 2>/dev/null
        clash_resp=$(curl -s "http://127.0.0.1:9090/version" -H "Authorization: Bearer $SECRET" 2>/dev/null)
        if echo "$clash_resp" | grep -q 'version'; then
          echo "│   ├── 运行状态: 运行中"
          # 代理模式
          cmode=$(curl -s "http://127.0.0.1:9090/configs" -H "Authorization: Bearer $SECRET" 2>/dev/null | jq -r '.mode // "unknown"' 2>/dev/null)
          echo "│   ├── 代理模式: ${cmode:-unknown}"
          # 当前节点
          cnode=$(curl -s "http://127.0.0.1:9090/proxies/GLOBAL" -H "Authorization: Bearer $SECRET" 2>/dev/null | jq -r '.now // "unknown"' 2>/dev/null)
          echo "│   └── 当前节点: ${cnode:-unknown}"
        else
          echo "│   ├── 运行状态: 未运行"
          echo "│   ├── 代理模式: N/A"
          echo "│   └── 当前节点: N/A"
        fi
      else
        echo "├── 数据流量: 未知 (无设备)"
        echo "├── 热点: 未知"
        echo "├── USB网络共享: 未知"
        echo "├── Clash"
        echo "│   ├── 运行状态: 未知"
        echo "│   ├── 代理模式: N/A"
        echo "│   └── 当前节点: N/A"
      fi

      # ─ 本机系统
      echo "└── 本机系统"
      mode=$(gsettings get org.gnome.system.proxy mode 2>/dev/null)
      if [ "$mode" = "'manual'" ]; then
        echo "    ├── 系统代理: 开"
      else
        echo "    ├── 系统代理: 关"
      fi
      # Google 联通 (通过代理测试)
      result=$(curl -x "http://${PROXY_HOST}:${PROXY_PORT}" \
        -s -o /dev/null -w '%{http_code} %{time_total}' \
        --connect-timeout 3 --max-time 5 \
        http://www.google.com 2>/dev/null)
      http_code=$(echo "$result" | cut -d' ' -f1)
      latency=$(echo "$result" | cut -d' ' -f2)
      if [ "$http_code" = "200" ] || [ "$http_code" = "301" ] || [ "$http_code" = "302" ]; then
        echo "    └── Google 连通性: ✓ (${latency}s)"
      else
        echo "    └── Google 连通性: ✗"
      fi
      ;;

    *)
      echo "未知命令: $1"
      echo "使用 phone help 查看可用命令"
      ;;
  esac
}

# 按逗号拆分，串行执行
IFS=',' read -ra ACTIONS <<< "$1"
for cmd in "${ACTIONS[@]}"; do
  # 去除首尾空格
  cmd=$(echo "$cmd" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  run_action "$cmd" "$2"
done
