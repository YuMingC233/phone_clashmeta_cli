# Clash Meta CLI Controller

通过 adb 直控 Android 手机上的 Clash Meta，提供 CLI 命令行和 Web UI 两种操作方式。

## 功能

- **Clash 控制**: 启动/停止 Clash、切换代理节点、切换代理模式 (Global / Rule / Direct)
- **手机设置**: 数据流量开关、WiFi 热点开关、USB 网络共享开关、静音
- **本机系统代理**: 开关 GNOME 系统代理（HTTP/HTTPS/SOCKS）
- **组合命令**: 一键启动 (Boot)、临时开/关代理
- **状态查看**: 树状显示手机、Clash、本机系统的实时状态
- **Web UI**: React 单页面控制台，自动刷新状态，节点下拉选择，root 权限检测

## 系统要求

- **Linux** 桌面环境 (GNOME，用于系统代理控制)
- **Node.js** 18+
- **pnpm** (包管理器)
- **adb** (Android Debug Bridge)，已添加到 PATH
- **Android 手机**，已安装 [Clash Meta](https://github.com/MetaCubeX/ClashMetaForAndroid)
- **USB 调试** 已开启并授权
- **Root 权限** (部分功能需要：热点、USB 网络共享、代理模式切换、静音)

## 安装

```bash
# 1. 克隆仓库
git clone <repo-url>
cd phone_clashmeta_cli

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填写你的 Clash API Secret 和代理地址

# 3. 安装依赖
cd server && pnpm install
cd ../client && pnpm install && pnpm run build

# 4. 注册系统服务 (可选，开机自启)
mkdir -p ~/.config/systemd/user/
cp systemd/clash-ctl-server.service ~/.config/systemd/user/ &&
systemctl --user daemon-reload &&
systemctl --user enable --now clash-ctl-server.service 

# 5. 注册 CLI 命令 (可选)
sudo ln -sf "$(pwd)/clash_ctl.sh" /usr/local/bin/phone
```

## 使用

### Web UI

浏览器打开 `http://localhost:3000`。

页面会自动获取手机状态并展示。左侧为信息面板，右侧为控制面板。部分功能（标记需要 Root 权限的按钮）在没有 root 时会被禁用。

### CLI

```bash
phone status            # 查看当前状态
phone clashon           # 启动 Clash
phone clashoff          # 停止 Clash
phone node "节点名"      # 切换代理节点
phone nodes             # 列出可用节点
phone clashmode rule    # 切换代理模式 (global|rule|direct)
phone mbdopen           # 打开手机数据流量
phone hspopen           # 打开 WiFi 热点 (需 root)
phone usbon             # 开启 USB 网络共享 (需 root)
phone usboff            # 关闭 USB 网络共享
phone mute              # 手机静音 (需 root)
phone gsyson            # 开启本机系统代理
phone gsysoff           # 关闭本机系统代理
phone booton            # 一键启动 (数据+USB+Clash+代理+静音)
phone tempon            # 临时开 (Clash+代理)
phone tempoff           # 临时关 (Clash+代理)
phone help              # 显示帮助
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SECRET` | Clash Meta API 密钥 | `7355608*` |
| `PROXY_HOST` | 代理主机地址 | `172.19.0.1` |
| `PROXY_PORT` | 代理端口 | `7698` |
| `WEB_PORT` | Web UI 端口 | `3000` |

## 开发

```bash
# 启动后端 (端口 3000)
cd server && pnpm run dev

# 启动前端开发服务器 (端口 5173，自动代理 API 到后端)
cd client && pnpm run dev
```


## 快速更新
可直接复制粘贴

```shell
# phase 1 build and packgage web ui
cd ./client && pnpm run build && cd .. && 
# phase 2 update systemd 
cp systemd/clash-ctl-server.service ~/.config/systemd/user/ &&
systemctl --user daemon-reload &&
systemctl --user enable --now clash-ctl-server.service 
```