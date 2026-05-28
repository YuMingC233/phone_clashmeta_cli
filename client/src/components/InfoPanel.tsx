import { Card, Tag, Descriptions, Badge } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WifiOutlined,
  UsbOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import type { FullStatus } from '../types';

interface Props {
  status: FullStatus | null;
}

function boolTag(v: boolean | undefined) {
  if (v) return <Tag color="green">开</Tag>;
  if (v === false) return <Tag color="red">关</Tag>;
  return <Tag>未知</Tag>;
}

function InfoPanel({ status }: Props) {
  if (!status) {
    return <Card title="状态"><p>无法获取状态，请检查设备连接。</p></Card>;
  }

  const { clash, system } = status;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 手机状态 */}
      <Card title="手机状态" size="small">
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label={<><MobileOutlined /> 数据流量</>}>
            {boolTag(status.mobileData)}
          </Descriptions.Item>
          <Descriptions.Item label={<><WifiOutlined /> 热点</>}>
            {boolTag(status.hotspot)}
          </Descriptions.Item>
          <Descriptions.Item label={<><UsbOutlined /> USB网络共享</>}>
            {boolTag(status.usb)}
          </Descriptions.Item>
          <Descriptions.Item label="Root 权限">
            {status.root ? <Tag color="green">有</Tag> : <Tag color="default">无</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Clash 状态 */}
      <Card title="Clash" size="small">
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="运行状态">
            {clash.running ? (
              <Badge status="processing" text="运行中" />
            ) : (
              <Badge status="default" text="未运行" />
            )}
          </Descriptions.Item>
          <Descriptions.Item label="代理模式">
            <Tag color="blue">{clash.mode ?? 'N/A'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="当前节点">
            <Tag color="purple">{clash.currentNode ?? 'N/A'}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 本机系统 */}
      <Card title="本机系统" size="small">
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="系统代理">
            {boolTag(system.proxy)}
          </Descriptions.Item>
          <Descriptions.Item label="Google 联通">
            {system.googleReachable ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                {system.googleLatency != null ? `${system.googleLatency}s` : '通'}
              </Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="error">不通</Tag>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}

export default InfoPanel;
