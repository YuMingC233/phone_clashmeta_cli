import { useState, useEffect, useCallback, useRef } from 'react';
import { Layout, Spin, message } from 'antd';
import { getStatus, getNodes, getRoot } from './api';
import type { FullStatus } from './types';
import InfoPanel from './components/InfoPanel';
import ControlPanel from './components/ControlPanel';

const { Header, Content } = Layout;

const POLL_INTERVAL_MS = 8000;

function App() {
  const [status, setStatus] = useState<FullStatus | null>(null);
  const [nodes, setNodes] = useState<string[]>([]);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [root, setRoot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [s, n, r] = await Promise.all([getStatus(), getNodes(), getRoot()]);
      setStatus(s);
      setNodes(n.all || []);
      setCurrentNode(n.now || null);
      setRoot(r.root);
    } catch {
      // status fetch failed silently - device likely disconnected
    }
    setLoading(false);
  }, []);

  // Retry-with-backoff for actions that restart Clash (mode switch, clash on/off)
  const refreshWithRetry = useCallback(async (maxRetries = 8, baseDelayMs = 800) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const [s, n, r] = await Promise.all([getStatus(), getNodes(), getRoot()]);
        setStatus(s);
        setNodes(n.all || []);
        setCurrentNode(n.now || null);
        setRoot(r.root);
        // If Clash is confirmed running with a valid mode, we're done
        if (s.clash?.running && s.clash?.mode !== null) {
          return;
        }
      } catch {
        // retry on failure
      }
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(1.5, i)));
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Periodic polling to keep UI in sync with device state
  useEffect(() => {
    const id = setInterval(() => {
      if (!pollingRef.current) {
        refresh();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const action = useCallback(
    async (actionName: string, fn: () => Promise<unknown>) => {
      setLoadingAction(actionName);
      pollingRef.current = true;
      try {
        await fn();
        message.success(`${actionName} 成功`);
        // For actions that restart Clash, retry until the API is back
        if (actionName === '切换代理模式' || actionName === '开启Clash' || actionName === '关闭Clash') {
          await refreshWithRetry();
        } else {
          await refresh();
        }
      } catch (err) {
        message.error(
          `操作失败: ${err instanceof Error ? err.message : "未知错误"}`,
        );
      } finally {
        setLoadingAction(null);
        pollingRef.current = false;
      }
    },
    [refresh, refreshWithRetry],
  );

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          height: 48,
          lineHeight: "48px",
          background: "#001529",
        }}
      >
        <h1 style={{ color: "#fff", margin: 0, fontSize: 16, fontWeight: 500 }}>
          Clash Meta Controller
        </h1>
      </Header>
      <Content
        style={{
          flex: 1,
          display: "flex",
          gap: 0,
          overflow: "hidden",
          padding: 0,
        }}
      >
        {loading ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Spin size="large" />
            <span style={{ color: "#999" }}>正在加载状态...</span>
          </div>
        ) : (
          <>
            <div style={{ flex: "0 0 65%", overflow: "hidden" }}>
              <InfoPanel status={status} />
            </div>
            <div style={{ flex: "0 0 35%", overflow: "hidden" }}>
              <ControlPanel
                status={status}
                nodes={nodes}
                currentNode={currentNode}
                root={root}
                loadingAction={loadingAction}
                onAction={action}
              />
            </div>
          </>
        )}
      </Content>
    </Layout>
  );
}

export default App;
