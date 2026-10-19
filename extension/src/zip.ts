import { PathExt } from '@jupyterlab/coreutils';
import { Contents } from '@jupyterlab/services';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { base64ToBytes, bytesToBase64 } from './bytes';
import { EXPORT_DIR } from './preview';

/** Never worth carrying in or out of a project. */
const JUNK_DIRS = new Set(['.ipynb_checkpoints', '__MACOSX', '.git', '.Trash']);
const JUNK_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function isJunk(relPath: string): boolean {
  const parts = relPath.split('/');
  return (
    parts.some(p => JUNK_DIRS.has(p)) ||
    JUNK_FILES.has(parts[parts.length - 1]) ||
    parts[parts.length - 1].startsWith('._')
  );
}

export interface IExportOptions {
  /** Include generated outputs in `_exports/` (SPEC: excluded by default). */
  includeExports?: boolean;
}

/**
 * Zip a project folder. Entries sit under `<project>/` so unzipping in the
 * Files app recreates the folder, and paths stay relative so the archive
 * mirrors the git checkout exactly.
 */
export async function zipProject(
  contents: Contents.IManager,
  project: string,
  options: IExportOptions = {}
): Promise<Uint8Array> {
  const files: Zippable = {};
  const walk = async (dir: string): Promise<void> => {
    const listing = await contents.get(dir, { content: true });
    for (const item of listing.content as Contents.IModel[]) {
      const rel = item.path.slice(project.length + 1);
      if (isJunk(rel) || (!options.includeExports && rel.split('/')[0] === EXPORT_DIR)) {
        continue;
      }
      if (item.type === 'directory') {
        await walk(item.path);
        continue;
      }
      const model = await contents.get(item.path, { content: true });
      files[`${project}/${rel}`] = fileBytes(model);
    }
  };
  await walk(project);
  return zipSync(files, { level: 6 });
}

function fileBytes(model: Contents.IModel): Uint8Array {
  if (model.format === 'base64') {
    return base64ToBytes(String(model.content));
  }
  if (model.format === 'json') {
    // Jupyter's own on-disk layout, so notebooks diff cleanly in git.
    return strToU8(JSON.stringify(model.content, null, 1) + '\n');
  }
  return strToU8(String(model.content ?? ''));
}

export interface IUnpacked {
  /** Suggested project name: the archive's single top folder, if it has one. */
  name: string | null;
  /** Files by path relative to the project root. */
  files: Map<string, Uint8Array>;
}

/** Read a project archive, dropping junk and a single shared top folder. */
export function unzipProject(data: Uint8Array): IUnpacked {
  const entries = Object.entries(unzipSync(data)).filter(
    ([path]) => !path.endsWith('/') && !isJunk(path)
  );
  const tops = new Set(entries.map(([path]) => path.split('/')[0]));
  const nested = entries.every(([path]) => path.includes('/'));
  const name = tops.size === 1 && nested ? [...tops][0] : null;
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of entries) {
    files.set(name ? path.slice(name.length + 1) : path, bytes);
  }
  return { name, files };
}

/** Folder-safe project name. */
export function cleanProjectName(name: string): string {
  return name
    .replace(/\.zip$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^[.\s]+|\s+$/g, '')
    .slice(0, 100);
}

export async function exists(contents: Contents.IManager, path: string): Promise<boolean> {
  try {
    await contents.get(path, { content: false });
    return true;
  } catch {
    return false;
  }
}

/** Write unpacked files into a new project folder (which must not exist). */
export async function writeProject(
  contents: Contents.IManager,
  project: string,
  files: Map<string, Uint8Array>
): Promise<void> {
  const dirs = new Set<string>([project]);
  for (const rel of files.keys()) {
    const parts = rel.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      dirs.add(PathExt.join(project, ...parts.slice(0, i)));
    }
  }
  // Parents before children: the in-browser drive needs them to exist.
  for (const dir of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length)) {
    await contents.save(dir, { type: 'directory' });
  }
  for (const [rel, bytes] of files) {
    await contents.save(PathExt.join(project, rel), fileModel(rel, bytes));
  }
}

function fileModel(rel: string, bytes: Uint8Array): Partial<Contents.IModel> {
  const text = asText(bytes);
  if (text !== null && rel.toLowerCase().endsWith('.ipynb')) {
    try {
      return { type: 'notebook', format: 'json', content: JSON.parse(text) };
    } catch {
      // Not valid JSON: keep it byte for byte as a plain file.
    }
  }
  if (text !== null) {
    return { type: 'file', format: 'text', content: text };
  }
  return { type: 'file', format: 'base64', content: bytesToBase64(bytes) };
}

/** UTF-8 text without NUL bytes, or null for binary data. */
function asText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) {
    return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
