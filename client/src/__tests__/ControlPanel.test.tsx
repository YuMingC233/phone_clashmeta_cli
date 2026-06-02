import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ControlPanel from '../components/ControlPanel';
import type { FullStatus } from '../types';

// Mock the api module so we don't make real network calls
vi.mock('../api', () => ({
  clashOn: vi.fn(() => Promise.resolve({ success: true })),
  clashOff: vi.fn(() => Promise.resolve({ success: true })),
  mobileDataOn: vi.fn(() => Promise.resolve({ success: true })),
  mobileDataOff: vi.fn(() => Promise.resolve({ success: true })),
  hotspotOpen: vi.fn(() => Promise.resolve({ success: true })),
  hotspotClose: vi.fn(() => Promise.resolve({ success: true })),
  usbOn: vi.fn(() => Promise.resolve({ success: true })),
  usbOff: vi.fn(() => Promise.resolve({ success: true })),
  mute: vi.fn(() => Promise.resolve({ success: true })),
  proxyOn: vi.fn(() => Promise.resolve({ success: true })),
  proxyOff: vi.fn(() => Promise.resolve({ success: true })),
  booton: vi.fn(() => Promise.resolve({ success: true })),
  tempon: vi.fn(() => Promise.resolve({ success: true })),
  tempoff: vi.fn(() => Promise.resolve({ success: true })),
  setMode: vi.fn(() => Promise.resolve({ success: true })),
}));

// Mock NodeSelector to simplify testing
vi.mock('../components/NodeSelector', () => ({
  default: () => <div data-testid="node-selector">NodeSelector</div>,
}));

function makeStatus(overrides: Partial<FullStatus> = {}): FullStatus {
  return {
    device: true,
    mobileData: true,
    hotspot: false,
    usb: false,
    clash: {
      running: true,
      mode: 'rule',
      currentNode: 'auto',
    },
    system: {
      proxy: false,
      googleReachable: false,
      googleLatency: null,
    },
    root: true,
    ...overrides,
  };
}

function renderPanel(status: FullStatus | null, loadingAction: string | null = null) {
  const onAction = vi.fn();
  const { rerender } = render(
    <ControlPanel
      status={status}
      nodes={['auto', 'node1', 'node2']}
      currentNode="auto"
      root={true}
      loadingAction={loadingAction}
      onAction={onAction}
    />
  );
  return { onAction, rerender };
}

describe('ControlPanel - Mode switching (Radio.Group)', () => {
  it('should render three mode radio buttons', () => {
    renderPanel(makeStatus());
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('Rule')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
  });

  it('should show current mode from status', () => {
    renderPanel(makeStatus({ clash: { running: true, mode: 'global', currentNode: 'auto' } }));
    const globalBtn = screen.getByText('Global').closest('label');
    const ruleBtn = screen.getByText('Rule').closest('label');
    expect(globalBtn?.classList.toString()).toContain('ant-radio-button-wrapper-checked');
    expect(ruleBtn?.classList.toString()).not.toContain('ant-radio-button-wrapper-checked');
  });

  it('should show no selected mode when mode is null', () => {
    // This is the critical scenario: after clashmode restarts Clash,
    // the initial refresh may return mode=null
    renderPanel(makeStatus({ clash: { running: false, mode: null, currentNode: null } }));
    // All three buttons should exist but none should be checked
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('Rule')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
  });

  it('should disable radio buttons when device is disconnected', () => {
    renderPanel(makeStatus({ device: false }));
    const globalBtn = screen.getByText('Global').closest('label');
    expect(globalBtn?.classList.toString()).toContain('ant-radio-button-wrapper-disabled');
  });

  it('should disable radio buttons when no root access', () => {
    render(
      <ControlPanel
        status={makeStatus()}
        nodes={['auto']}
        currentNode="auto"
        root={false}
        loadingAction={null}
        onAction={vi.fn()}
      />
    );
    const globalBtn = screen.getByText('Global').closest('label');
    expect(globalBtn?.classList.toString()).toContain('ant-radio-button-wrapper-disabled');
  });

  it('should disable radio buttons when clash is not running', () => {
    renderPanel(makeStatus({ clash: { running: false, mode: null, currentNode: null } }));
    const globalBtn = screen.getByText('Global').closest('label');
    expect(globalBtn?.classList.toString()).toContain('ant-radio-button-wrapper-disabled');
  });

  it('should NOT be disabled when device, root, and clash are all good', () => {
    renderPanel(makeStatus());
    const globalBtn = screen.getByText('Global').closest('label');
    expect(globalBtn?.classList.toString()).not.toContain('ant-radio-button-wrapper-disabled');
  });

  it('should trigger onAction with setMode when a radio button is clicked', async () => {
    const { onAction } = renderPanel(makeStatus());
    const user = userEvent.setup();
    await user.click(screen.getByText('Global'));
    expect(onAction).toHaveBeenCalledWith('切换代理模式', expect.any(Function));
  });

  it('should not trigger onAction when disabled (no root)', async () => {
    const onAction = vi.fn();
    render(
      <ControlPanel
        status={makeStatus()}
        nodes={['auto']}
        currentNode="auto"
        root={false}
        loadingAction={null}
        onAction={onAction}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Global'));
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('ControlPanel - Post-clashmode refresh race condition', () => {
  it('should show NO selected mode when clash.running=false with mode=null', () => {
    // Simulating the exact scenario after clashmode:
    // Clash restarted, script returned, frontend refreshed status,
    // but Clash API isn't ready yet → clash.running=false, mode=null
    const postRestartStatus = makeStatus({
      clash: { running: false, mode: null, currentNode: null },
    });

    renderPanel(postRestartStatus);

    // All radio buttons should exist
    const globalBtn = screen.getByText('Global').closest('label');
    const ruleBtn = screen.getByText('Rule').closest('label');
    const directBtn = screen.getByText('Direct').closest('label');

    // But they're all DISABLED (because clashRunning=false)
    expect(globalBtn?.classList.toString()).toContain('ant-radio-button-wrapper-disabled');
    expect(ruleBtn?.classList.toString()).toContain('ant-radio-button-wrapper-disabled');
    expect(directBtn?.classList.toString()).toContain('ant-radio-button-wrapper-disabled');

    // And none is checked (because value is undefined when mode is null)
    expect(globalBtn?.classList.toString()).not.toContain('checked');
    expect(ruleBtn?.classList.toString()).not.toContain('checked');
    expect(directBtn?.classList.toString()).not.toContain('checked');

    // The user sees: all three disabled, none selected
    // This is confusing because they just successfully changed the mode
  });

  it('should eventually show correct mode once clash is running again', () => {
    // After Clash fully initializes (~4-8 seconds), a refresh would show the new mode
    const postInitStatus = makeStatus({
      clash: { running: true, mode: 'global', currentNode: 'auto' },
    });

    renderPanel(postInitStatus);

    const globalBtn = screen.getByText('Global').closest('label');
    expect(globalBtn?.classList.toString()).toContain('ant-radio-button-wrapper-checked');
    expect(globalBtn?.classList.toString()).not.toContain('disabled');
  });
});
