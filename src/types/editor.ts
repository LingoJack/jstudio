/** Editor, graph, plugin, and sync configuration types */

export interface GraphNode {
  id: string;
  label: string;
  emoji: string;
  group: 'main' | 'sub';
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  isEnabled: boolean;
  category: 'Editor' | 'Utility' | 'Theme';
}

export interface SyncConfig {
  isEnabled: boolean;
  serverUrl: string;
  deviceId: string;
  lastSyncedAt?: string;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
}

export interface LocalAsset {
  id: string;
  name: string;
  type: string;
  size: string;
  createdAt: string;
  content: string; // base64 or placeholder URL
}
