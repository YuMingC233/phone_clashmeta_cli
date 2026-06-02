import { describe, it, expect, vi } from 'vitest';

// Mock child_process before importing the server module
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// We'll test the routing logic by importing a testable version
// The server uses Express, let's test the handler functions directly

describe('PUT /api/mode endpoint', () => {
  // Simulate the validation logic used in the server
  const VALID_MODES = ['global', 'rule', 'direct'];

  function validateMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      return { error: 'mode must be global, rule, or direct', status: 400 };
    }
    return { valid: true };
  }

  it('should accept "global" mode', () => {
    expect(validateMode('global')).toEqual({ valid: true });
  });

  it('should accept "rule" mode', () => {
    expect(validateMode('rule')).toEqual({ valid: true });
  });

  it('should accept "direct" mode', () => {
    expect(validateMode('direct')).toEqual({ valid: true });
  });

  it('should reject empty mode', () => {
    const result = validateMode('');
    expect(result.status).toBe(400);
    expect(result.error).toContain('must be');
  });

  it('should reject invalid mode "proxy"', () => {
    const result = validateMode('proxy');
    expect(result.status).toBe(400);
  });

  it('should reject case-sensitive variant "Global"', () => {
    const result = validateMode('Global');
    expect(result.status).toBe(400);
  });

  it('should reject null/undefined mode', () => {
    const result = validateMode(undefined);
    expect(result.status).toBe(400);
  });

  it('should reject mode with extra spaces', () => {
    const result = validateMode(' rule');
    expect(result.status).toBe(400);
  });
});

describe('clashmode shell script logic', () => {
  // Test the mode switching logic as implemented in clash_ctl.sh

  function simulateClashMode(requestedMode, currentMode) {
    // Replicates the clashmode case logic
    const VALID = ['global', 'rule', 'direct'];
    if (!VALID.includes(requestedMode)) {
      return { output: `用法: phone clashmode <global|rule|direct>`, code: 1 };
    }

    if (currentMode === requestedMode) {
      return { output: `代理模式已是: ${requestedMode}`, code: 0, restartNeeded: false };
    }

    // Mode differs — need to update override.json and restart
    return {
      output: `代理模式已切换为: ${requestedMode} (已重启 Clash)`,
      code: 0,
      restartNeeded: true,
      steps: [
        'read override.json via su',
        'modify mode field with jq',
        'write override.json via su',
        'STOP_CLASH intent',
        'sleep 2',
        'START_CLASH intent',
        'sleep 3',
      ],
    };
  }

  it('should restart Clash when switching from rule to global', () => {
    const result = simulateClashMode('global', 'rule');
    expect(result.restartNeeded).toBe(true);
    expect(result.output).toContain('已重启 Clash');
  });

  it('should restart Clash when switching from global to direct', () => {
    const result = simulateClashMode('direct', 'global');
    expect(result.restartNeeded).toBe(true);
  });

  it('should NOT restart when mode already matches', () => {
    const result = simulateClashMode('rule', 'rule');
    expect(result.restartNeeded).toBe(false);
    expect(result.output).toContain('已是');
  });

  it('should restart Clash every time mode changes', () => {
    // This is the key issue: changing mode ALWAYS restarts Clash
    // After restart, it takes ~5 seconds + Clash init time
    // But the frontend refreshes immediately after the API returns
    const result = simulateClashMode('global', 'rule');
    expect(result.restartNeeded).toBe(true);
    expect(result.steps).toContain('STOP_CLASH intent');
    expect(result.steps).toContain('START_CLASH intent');
    // Total wait: sleep 2 + sleep 3 = 5 seconds minimum
    // Clash Meta may need additional time to fully initialize
  });

  it('should return error for invalid mode', () => {
    const result = simulateClashMode('invalid', 'rule');
    expect(result.code).toBe(1);
    expect(result.output).toContain('用法');
  });
});

describe('Status refresh race condition', () => {
  // When clashmode restarts Clash:
  // 1. Script sleeps 5s total, then returns
  // 2. Backend returns {success: true}
  // 3. Frontend immediately calls refresh() → GET /api/status
  // 4. status_json checks /version → if Clash not ready, clash_running=false
  // 5. When clash_running is false, mode = null
  // 6. Radio.Group value = undefined (no button selected)

  function simulateStatusRefresh(clashReady) {
    if (!clashReady) {
      return {
        clash: {
          running: false,
          mode: null,
          currentNode: null,
        },
      };
    }
    return {
      clash: {
        running: true,
        mode: 'global',
        currentNode: 'auto',
      },
    };
  }

  it('should report mode=null when Clash is not ready yet', () => {
    const status = simulateStatusRefresh(false);
    expect(status.clash.running).toBe(false);
    expect(status.clash.mode).toBeNull();
  });

  it('should report mode correctly when Clash is ready', () => {
    const status = simulateStatusRefresh(true);
    expect(status.clash.running).toBe(true);
    expect(status.clash.mode).toBe('global');
  });

  it('should handle the post-restart race condition', () => {
    // After clashmode restarts Clash, there's a window where:
    // - Clash process is starting but API isn't serving yet
    // - status_json returns mode=null
    // - Frontend shows NO radio button selected
    const results = [];
    // Simulate checking status every second after restart
    for (let secondsAfterRestart = 0; secondsAfterRestart < 10; secondsAfterRestart++) {
      // Clash Meta typically takes 3-8 seconds to fully initialize
      const ready = secondsAfterRestart >= 4;
      results.push({
        seconds: secondsAfterRestart,
        ...simulateStatusRefresh(ready).clash,
      });
    }

    // At t=0 (immediately after script returns), Clash is NOT ready
    expect(results[0].running).toBe(false);
    expect(results[0].mode).toBeNull();

    // At t=4+, Clash should be ready
    expect(results[4].running).toBe(true);
    expect(results[4].mode).toBe('global');

    // But the frontend only refreshes ONCE (at t≈0 after action completes)
    // So it will get results[0] and never update
  });
});
