import { mystParse } from 'myst-parser';
import {
  basicTransformations,
  enumerateTargetsTransform,
  getFrontmatter,
  mathTransform,
  ReferenceState,
  resolveReferencesTransform
} from 'myst-transforms';
import mystToTypst from 'myst-to-typst';
import { unified } from 'unified';
import { VFile } from 'vfile';

import { TEMPLATES } from './templates';

export const TEMPLATE_DIR = '/_bargueno/templates';

export interface ITypstDocument {
  /** The complete main.typ source. */
  source: string;
  /** Relative paths of images the document references. */
  images: string[];
  /** Name of the bundled template used. */
  template: string;
  /** Problems found while converting (not Typst compile errors). */
  warnings: string[];
}

/**
 * Parse a MyST Markdown file and turn it into a Typst document that calls a
 * bundled template with the frontmatter.
 */
export function mystToTypstDocument(
  text: string,
  path: string,
  defaultTemplate = 'article'
): ITypstDocument {
  const file = new VFile({ path });
  const tree = mystParse(text) as any;
  const { frontmatter } = getFrontmatter(file, tree) as { frontmatter: any };
  basicTransformations(tree, file, {});
  mathTransform(tree, file);
  const state = new ReferenceState(path, { frontmatter, vfile: file });
  enumerateTargetsTransform(tree, { state });
  resolveReferencesTransform(tree, file, { state });

  const images: string[] = [];
  walk(tree, node => {
    if (node.type === 'image' && typeof node.url === 'string' && isLocal(node.url)) {
      images.push(node.url);
    }
  });

  const result = (unified().use(mystToTypst).stringify(tree, file) as any)
    .result as { value: string; macros: string[] };

  // Frontmatter wins over the project's default (bargueno.yml `template:`).
  const wanted: string = frontmatter.template ?? defaultTemplate;
  const template = TEMPLATES[wanted] ? wanted : 'article';
  const warnings = file.messages.map(m => m.message);
  if (wanted !== template) {
    warnings.push(`Template "${wanted}" is not available yet; using "${template}".`);
  }

  const source = [
    `#import "${TEMPLATE_DIR}/${template}.typ": ${template}`,
    ...result.macros,
    `#show: ${template}.with(${templateArgs(frontmatter)})`,
    '',
    result.value,
    ''
  ].join('\n');
  return { source, images: [...new Set(images)], template, warnings };
}

/** Named template arguments from MyST frontmatter (see templates.ts). */
function templateArgs(fm: any): string {
  const args: Record<string, unknown> = {
    title: str(fm.title),
    subtitle: str(fm.subtitle),
    authors: asList(fm.authors ?? fm.author).map((a: any) =>
      typeof a === 'string'
        ? { name: a, affiliations: [], email: null }
        : {
            name: str(a?.name) ?? '',
            affiliations: asList(a?.affiliations ?? a?.affiliation).map(affName),
            email: str(a?.email)
          }
    ),
    date: fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : str(fm.date),
    abstract: str(fm.abstract),
    keywords: asList(fm.keywords).map(k => String(k))
  };
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${toTypst(value)}`)
    .join(', ');
}

function affName(a: any): string {
  return typeof a === 'string' ? a : String(a?.name ?? a?.institution ?? a?.id ?? '');
}

function str(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value);
}

function asList(value: unknown): any[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** Serialise plain data as a Typst value. */
export function toTypst(value: unknown): string {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    // A trailing comma keeps one-element arrays from collapsing into a value.
    return `(${value.map(toTypst).join(', ')}${value.length === 1 ? ',' : ''})`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return '(:)';
  }
  return `(${entries.map(([k, v]) => `${k}: ${toTypst(v)}`).join(', ')})`;
}

function walk(node: any, visit: (node: any) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

function isLocal(url: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//');
}
