export interface ClashStatus {
  running: boolean;
  mode: string | null;
  currentNode: string | null;
}

export interface SystemStatus {
  proxy: boolean;
  googleReachable: boolean;
  googleLatency: number | null;
}

export interface FullStatus {
  device: boolean;
  mobileData: boolean;
  hotspot: boolean;
  usb: boolean;
  clash: ClashStatus;
  system: SystemStatus;
  root: boolean;
}

export interface NodesData {
  now: string;
  all: string[];
}

export interface RootCheck {
  root: boolean;
}

export interface SuccessResponse {
  success: boolean;
}
