import { Card, Button, Space, Divider, Tooltip, Radio } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  MobileOutlined,
  WifiOutlined,
  UsbOutlined,
  GlobalOutlined,
  PoweroffOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { FullStatus } from '../types';
import {
  clashOn, clashOff, mobileData, hotspot, usbOn, usbOff,
  mute, proxyOn, proxyOff, booton, tempon, tempoff, setMode,
} from '../api';
import NodeSelector from './NodeSelector';

interface Props {
  status: FullStatus | null;
  nodes: string[];
  currentNode: string | null;
  root: boolean;
  onAction: (fn: () => Promise<unknown>) => void;
}

const btnProps = (disabled: boolean) => ({
  size: 'small' as const,
  block: true,
  disabled,
});

function ControlPanel({ status, nodes, currentNode, root, onAction }: Props) {
  const clashRunning = status?.clash?.running ?? false;
  const proxyOn_ = status?.system?.proxy ?? false;
  const noDevice = !status?.device;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Clash 控制 */}
      <Card title="Clash 控制" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            {...btnProps(noDevice)}
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => onAction(clashOn)}
          >
            启动 Clash
          </Button>
          <Button
            {...btnProps(noDevice)}
            danger
            icon={<PauseCircleOutlined />}
            onClick={() => onAction(clashOff)}
          >
            停止 Clash
          </Button>
        </Space>

        <Divider style={{ margin: '12px 0' }} />

        <NodeSelector
          nodes={nodes}
          currentNode={currentNode}
          disabled={noDevice || !clashRunning}
          onAction={onAction}
        />

        <Divider style={{ margin: '12px 0' }} />

        <Radio.Group
          value={status?.clash?.mode ?? undefined}
          size="small"
          buttonStyle="solid"
          disabled={noDevice || !root || !clashRunning}
          onChange={(e) => onAction(() => setMode(e.target.value))}
        >
          <Radio.Button value="global">Global</Radio.Button>
          <Radio.Button value="rule">Rule</Radio.Button>
          <Radio.Button value="direct">Direct</Radio.Button>
        </Radio.Group>
      </Card>

      {/* 手机设置 */}
      <Card title="手机设置" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button {...btnProps(noDevice)} icon={<MobileOutlined />}
            onClick={() => onAction(mobileData)}>
            开启数据流量
          </Button>
          <Tooltip title={!root ? '需要 Root 权限' : undefined}>
            <Button {...btnProps(noDevice || !root)} icon={<WifiOutlined />}
              onClick={() => onAction(hotspot)}>
              开启热点
            </Button>
          </Tooltip>
          <Tooltip title={!root ? '需要 Root 权限' : undefined}>
            <Button {...btnProps(noDevice || !root)} icon={<UsbOutlined />}
              onClick={() => onAction(usbOn)}>
              USB 网络共享 开
            </Button>
          </Tooltip>
          <Tooltip title={!root ? '需要 Root 权限' : undefined}>
            <Button {...btnProps(noDevice || !root)} icon={<UsbOutlined />}
              onClick={() => onAction(usbOff)}>
              USB 网络共享 关
            </Button>
          </Tooltip>
          <Tooltip title={!root ? '需要 Root 权限' : undefined}>
            <Button {...btnProps(noDevice || !root)}
              onClick={() => onAction(mute)}>
              手机静音
            </Button>
          </Tooltip>
        </Space>
      </Card>

      {/* 本机代理 */}
      <Card title="本机系统" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button {...btnProps(false)} icon={<GlobalOutlined />}
            type={proxyOn_ ? 'primary' : 'default'}
            onClick={() => onAction(proxyOn)}>
            系统代理 开
          </Button>
          <Button {...btnProps(false)}
            onClick={() => onAction(proxyOff)}>
            系统代理 关
          </Button>
        </Space>
      </Card>

      {/* 组合命令 */}
      <Card title="组合命令" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button {...btnProps(noDevice || !root)} icon={<PoweroffOutlined />}
            type="primary" onClick={() => onAction(booton)}>
            一键启动 (Boot)
          </Button>
          <Button {...btnProps(noDevice)} icon={<ThunderboltOutlined />}
            onClick={() => onAction(tempon)}>
            临时开 (Temp On)
          </Button>
          <Button {...btnProps(false)}
            onClick={() => onAction(tempoff)}>
            临时关 (Temp Off)
          </Button>
        </Space>
      </Card>
    </div>
  );
}

export default ControlPanel;
