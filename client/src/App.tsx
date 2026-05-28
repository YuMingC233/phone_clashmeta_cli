import { useState, useEffect, useCallback } from 'react';
import { Layout, Spin, message } from 'antd';
import { getStatus, getNodes, getRoot } from './api';
import type { FullStatus } from './types';
import InfoPanel from './components/InfoPanel';
import ControlPanel from './components/ControlPanel';

const { Header, Content } = Layout;

function App() {
  const [status, setStatus] = useState<FullStatus | null>(null);
  const [nodes, setNodes] = useState<string[]>([]);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [root, setRoot] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, n, r] = await Promise.all([
        getStatus(),
        getNodes(),
        getRoot(),
      ]);
      setStatus(s);
      setNodes(n.all || []);
      setCurrentNode(n.now || null);
      setRoot(r.root);
    } catch {
      // status fetch failed silently - device likely disconnected
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const action = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      message.success('操作成功');
      await refresh();
    } catch (err) {
      message.error(`操作失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [refresh]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: 18 }}>Clash Meta Controller</h1>
      </Header>
      <Content style={{ padding: 24, display: 'flex', gap: 24 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <div style={{ flex: '0 0 70%' }}>
              <InfoPanel status={status} />
            </div>
            <div style={{ flex: '0 0 30%' }}>
              <ControlPanel
                status={status}
                nodes={nodes}
                currentNode={currentNode}
                root={root}
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
