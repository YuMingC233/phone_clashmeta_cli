import type { FullStatus, NodesData, RootCheck, SuccessResponse } from './types';

const API = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    let msg = `API error: ${res.status}`;
    try { msg = JSON.parse(body).error || msg; } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json();
}

function post(path: string) {
  return request<SuccessResponse>(path, { method: 'POST' });
}

export const getStatus  = ()                  => request<FullStatus>('/status');
export const getRoot    = ()                  => request<RootCheck>('/root-check');
export const getNodes   = ()                  => request<NodesData>('/nodes');
export const clashOn    = ()                  => post('/clash/on');
export const clashOff   = ()                  => post('/clash/off');
export const mobileData = ()                  => post('/mobile-data');
export const hotspot    = ()                  => post('/hotspot');
export const usbOn      = ()                  => post('/usb/on');
export const usbOff     = ()                  => post('/usb/off');
export const mute       = ()                  => post('/mute');
export const proxyOn    = ()                  => post('/proxy/on');
export const proxyOff   = ()                  => post('/proxy/off');
export const booton     = ()                  => post('/booton');
export const tempon     = ()                  => post('/tempon');
export const tempoff    = ()                  => post('/tempoff');

export function switchNode(name: string, group?: string) {
  return request<SuccessResponse>('/node', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, group: group || 'GLOBAL' }),
  });
}

export function setMode(mode: string) {
  return request<SuccessResponse>('/mode', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
}
