import { Select } from 'antd';
import { switchNode } from '../api';

interface Props {
  nodes: string[];
  currentNode: string | null;
  disabled: boolean;
  onAction: (actionName: string, fn: () => Promise<unknown>) => void;
}

function NodeSelector({ nodes, currentNode, disabled, onAction }: Props) {
  return (
    <Select
      showSearch
      size="middle"
      style={{ width: '100%' }}
      placeholder="选择节点"
      value={currentNode ?? undefined}
      disabled={disabled}
      options={nodes.map((n) => ({ label: n, value: n }))}
      filterOption={(input, option) =>
        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
      }
      onChange={(name) => onAction('切换节点', () => switchNode(name))}
    />
  );
}

export default NodeSelector;
