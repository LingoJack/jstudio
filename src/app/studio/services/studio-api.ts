import { invoke } from '@tauri-apps/api/core'
import type {
  Backlink,
  KnowledgeGraph,
  PageDoc,
  PageSummary,
  PluginManifest,
  SyncStatus,
  WorkspaceMeta,
} from '../model/workspace'

export async function openWorkspace(path?: string | null): Promise<WorkspaceMeta> {
  return invoke<WorkspaceMeta>('open_workspace', { path })
}

export async function listPages(workspacePath: string): Promise<PageSummary[]> {
  return invoke<PageSummary[]>('list_pages', { workspacePath })
}

export async function createPage(
  workspacePath: string,
  title?: string,
  parentId?: string | null
): Promise<PageDoc> {
  return invoke<PageDoc>('create_page', { workspacePath, title, parentId })
}

export async function getPage(workspacePath: string, pageId: string): Promise<PageDoc> {
  return invoke<PageDoc>('get_page', { workspacePath, pageId })
}

export async function savePage(workspacePath: string, page: PageDoc): Promise<PageDoc> {
  return invoke<PageDoc>('save_page', { workspacePath, page })
}

export async function deletePage(workspacePath: string, pageId: string): Promise<PageSummary[]> {
  return invoke<PageSummary[]>('delete_page', { workspacePath, pageId })
}

export async function rebuildGraph(workspacePath: string): Promise<KnowledgeGraph> {
  return invoke<KnowledgeGraph>('rebuild_graph', { workspacePath })
}

export async function getGraph(workspacePath: string): Promise<KnowledgeGraph> {
  return invoke<KnowledgeGraph>('get_graph', { workspacePath })
}

export async function getBacklinks(workspacePath: string, pageId: string): Promise<Backlink[]> {
  return invoke<Backlink[]>('get_backlinks', { workspacePath, pageId })
}

export async function listPlugins(): Promise<PluginManifest[]> {
  return invoke<PluginManifest[]>('list_plugins')
}

export async function getSyncStatus(workspacePath: string): Promise<SyncStatus> {
  return invoke<SyncStatus>('get_sync_status', { workspacePath })
}
