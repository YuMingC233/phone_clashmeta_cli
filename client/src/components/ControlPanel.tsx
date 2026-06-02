import { Card, Button, Space, Divider, Tooltip, Radio, Switch } from 'antd';
import {
  MobileOutlined,
  WifiOutlined,
  UsbOutlined,
  GlobalOutlined,
  PoweroffOutlined,
  ThunderboltOutlined,
  SoundOutlined,
  LockOutlined,
} from '@ant-design/icons';
import type { FullStatus } from '../types';
import {
  clashOn, clashOff, mobileDataOn, mobileDataOff,
  hotspotOpen, hotspotClose, usbOn, usbOff,
  mute, proxyOn, proxyOff, booton, tempon, tempoff, setMode,
} from '../api';
import NodeSelector from './NodeSelector';

interface Props {
  status: FullStatus | null;
  nodes: string[];
  currentNode: string | null;
  root: boolean;
  loadingAction: string | null;
  onAction: (actionName: string, fn: () => Promise<unknown>) => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 0',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
};

interface SwitchRowProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  disabled: boolean;
  loading: boolean;
  onToggle: (checked: boolean) => void;
  rootRequired?: boolean;
  noRoot?: boolean;
}

function SwitchRow({ icon, label, checked, disabled, loading, onToggle, rootRequired, noRoot }: SwitchRowProps) {
  const locked = rootRequired && noRoot;
  return (
    <div style={rowStyle}>
      <span style={{ ...labelStyle, opacity: locked ? 0.5 : 1 }}>
        {icon}
        <span>{label}</span>
        {locked && <LockOutlined style={{ fontSize: 12, color: '#999' }} />}
      </span>
      <Switch
        checked={checked}
        disabled={disabled || locked}
        loading={loading}
        onChange={onToggle}
      />
    </div>
  );
}

function ControlPanel({ status, nodes, currentNode, root, loadingAction, onAction }: Props) {
  const clashRunning = status?.clash?.running ?? false;
  const mobileDataOn_ = status?.mobileData ?? false;
  const hotspotOn = status?.hotspot ?? false;
  const usbOn_ = status?.usb ?? false;
  const proxyOn_ = status?.system?.proxy ?? false;
  const noDevice = !status?.device;
  const isBusy = loadingAction !== null;

  const handleToggle = (label: string, onFn: () => Promise<unknown>, offFn: () => Promise<unknown>) =>
    (checked: boolean) => {
      const actionName = checked ? `开启${label}` : `关闭${label}`;
      onAction(actionName, checked ? onFn : offFn);
    };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '12px 16px',
      overflowY: 'auto',
      height: '100%',
    }}>
      {/* Clash 控制 */}
      <Card title="Clash 控制" size="default" styles={{ body: { padding: '12px 16px' } }}>
        <SwitchRow
          icon={clashRunning ? <span style={{ color: '#1677ff' }}>⚡</span> : <span style={{ color: '#999' }}>⏸</span>}
          label="Clash"
          checked={clashRunning}
          disabled={noDevice || isBusy}
          loading={loadingAction === '开启Clash' || loadingAction === '关闭Clash'}
          onToggle={handleToggle('Clash', clashOn, clashOff)}
        />

        <Divider style={{ margin: '10px 0' }} />

        <NodeSelector
          nodes={nodes}
          currentNode={currentNode}
          disabled={noDevice || !clashRunning || isBusy}
          onAction={onAction}
        />

        <Divider style={{ margin: '10px 0' }} />

        <Radio.Group
          value={status?.clash?.mode ?? undefined}
          size="middle"
          buttonStyle="solid"
          disabled={noDevice || !root || !clashRunning || isBusy}
          onChange={(e) => onAction('切换代理模式', () => setMode(e.target.value))}
        >
          <Radio.Button value="global">Global</Radio.Button>
          <Radio.Button value="rule">Rule</Radio.Button>
          <Radio.Button value="direct">Direct</Radio.Button>
        </Radio.Group>
      </Card>

      {/* 手机设置 */}
      <Card title="手机设置" size="default" styles={{ body: { padding: '12px 16px' } }}>
        <SwitchRow
          icon={<MobileOutlined />}
          label="数据流量"
          checked={mobileDataOn_}
          disabled={noDevice || isBusy}
          loading={loadingAction === '开启数据流量' || loadingAction === '关闭数据流量'}
          onToggle={handleToggle('数据流量', mobileDataOn, mobileDataOff)}
        />
        <Divider style={{ margin: '2px 0' }} />
        <SwitchRow
          icon={<WifiOutlined />}
          label="热点"
          checked={hotspotOn}
          disabled={noDevice || isBusy}
          loading={loadingAction === '开启热点' || loadingAction === '关闭热点'}
          onToggle={handleToggle('热点', hotspotOpen, hotspotClose)}
          rootRequired
          noRoot={!root}
        />
        <Divider style={{ margin: '2px 0' }} />
        <SwitchRow
          icon={<UsbOutlined />}
          label="USB 网络共享"
          checked={usbOn_}
          disabled={noDevice || isBusy}
          loading={loadingAction === '开启USB网络共享' || loadingAction === '关闭USB网络共享'}
          onToggle={handleToggle('USB网络共享', usbOn, usbOff)}
          rootRequired
          noRoot={!root}
        />
        <Divider style={{ margin: '2px 0' }} />
        <div style={rowStyle}>
          <span style={labelStyle}>
            <SoundOutlined />
            <span>手机静音</span>
          </span>
          <Button
            size="small"
            type="link"
            disabled={noDevice || !root || isBusy}
            loading={loadingAction === '手机静音'}
            onClick={() => onAction('手机静音', mute)}
          >
            执行
          </Button>
        </div>
      </Card>

      {/* 本机系统 */}
      <Card title="本机系统" size="default" styles={{ body: { padding: '12px 16px' } }}>
        <SwitchRow
          icon={<GlobalOutlined />}
          label="系统代理"
          checked={proxyOn_}
          disabled={isBusy}
          loading={loadingAction === '开启系统代理' || loadingAction === '关闭系统代理'}
          onToggle={handleToggle('系统代理', proxyOn, proxyOff)}
        />
      </Card>

      {/* 组合命令 */}
      <Card title="组合命令" size="default" styles={{ body: { padding: '12px 16px' } }}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Tooltip title={!root ? '需要 Root 权限' : undefined}>
            <Button
              size="middle"
              block
              type="primary"
              disabled={noDevice || !root || isBusy}
              icon={<PoweroffOutlined />}
              loading={loadingAction === '一键启动'}
              onClick={() => onAction('一键启动', booton)}
            >
              一键启动 (Boot)
            </Button>
          </Tooltip>
          <div style={rowStyle}>
            <span style={labelStyle}>
              <ThunderboltOutlined />
              <span>临时</span>
            </span>
            <Switch
              checked={clashRunning && proxyOn_}
              disabled={(noDevice && !proxyOn_) || isBusy}
              loading={loadingAction === '开启临时' || loadingAction === '关闭临时'}
              onChange={handleToggle('临时', tempon, tempoff)}
            />
          </div>
        </Space>
      </Card>
    </div>
  );
}

export default ControlPanel;
