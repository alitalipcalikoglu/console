import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'yaml';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function openApiOperations() {
  const document = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
  const operations = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of Object.keys(item)) if (HTTP_METHODS.has(method)) operations.push(`${method.toUpperCase()} ${path}`);
  }
  return { operations, paths: Object.keys(document.paths).length };
}

/** Derive filesystem paths and exported HTTP methods from actual SvelteKit endpoint source. */
function svelteKitOperations() {
  const routesRoot = fileURLToPath(new URL('../../src/routes/', import.meta.url));
  /** @type {string[]} */
  const operations = [];
  /** @param {string} directory */
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      if (!entry.isFile() || entry.name !== '+server.ts') continue;
      const source = readFileSync(path, 'utf8');
      const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const route = `/${relative(routesRoot, directory).split(sep).filter((part) => !/^\(.*\)$/.test(part)).join('/')}`
        .replace(/\[([^\]]+)\]/g, '{$1}');
      for (const statement of tree.statements) {
        if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const method = declaration.name.text.toLowerCase();
          if (HTTP_METHODS.has(method)) operations.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
  }
  walk(routesRoot);
  return operations;
}

test('final gate: SvelteKit filesystem endpoints match canonical OpenAPI bidirectionally', () => {
  const canonical = openApiOperations();
  const implementation = svelteKitOperations();
  const duplicates = implementation.filter((value, index) => implementation.indexOf(value) !== index);
  const missing = canonical.operations.filter((operation) => !implementation.includes(operation));
  const extra = implementation.filter((operation) => !canonical.operations.includes(operation));
  assert.equal(canonical.paths, 122);
  assert.equal(canonical.operations.length, 156);
  assert.equal(implementation.length, 156);
  assert.deepEqual(duplicates, [], `duplicate SvelteKit operations: ${duplicates.join(', ')}`);
  assert.deepEqual(missing, [], `missing SvelteKit operations: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `extra SvelteKit operations: ${extra.join(', ')}`);
  assert.deepEqual([...implementation].sort(), [...canonical.operations].sort());
});
