import { invoke } from '@tauri-apps/api/core'
import type { InitialResp, ListResp, ParsedDocument, RenderedDoc } from './types'

interface CreateResp {
  path: string
}

interface AssetResp {
  mime: string
  bytes: number[]
}

export async function getInitial(): Promise<InitialResp> {
  return invoke<InitialResp>('get_initial')
}

export async function readFile(path: string): Promise<RenderedDoc> {
  return invoke<RenderedDoc>('read_file', { path })
}

export async function listDir(dir: string, hidden = false): Promise<ListResp> {
  return invoke<ListResp>('list_dir', { dir, hidden })
}

export async function parseMarkdown(source: string): Promise<ParsedDocument> {
  return invoke<ParsedDocument>('parse_markdown', { source })
}

export async function saveFile(path: string, source: string): Promise<void> {
  return invoke<void>('save_file', { req: { path, source } })
}

export async function createFile(dir: string, name: string): Promise<string> {
  const resp = await invoke<CreateResp>('create_file', { req: { dir, name } })
  return resp.path
}

export async function createDir(dir: string, name: string): Promise<string> {
  const resp = await invoke<CreateResp>('create_dir', { req: { dir, name } })
  return resp.path
}

export async function readAsset(path: string): Promise<Blob> {
  const resp = await invoke<AssetResp>('read_asset', { path })
  return new Blob([new Uint8Array(resp.bytes)], { type: resp.mime })
}

export async function quitReaderWindow(): Promise<void> {
  return invoke<void>('quit_reader')
}
