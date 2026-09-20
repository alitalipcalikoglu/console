import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'yaml';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function openApiOperations() {
  const document = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
  /** @type {string[]} */
  const operations = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of Object.keys(item)) if (HTTP_METHODS.has(method)) operations.push(`${method.toUpperCase()} ${path}`);
  }
  return { operations, paths: Object.keys(document.paths).length };
}

/** Inspect route registrations in the real current Fastify source; no tuple is hand-maintained. */
function fastifyOperations() {
  const file = new URL('../../src/http/console-api.js', import.meta.url);
  const source = readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {string[]} */
  const operations = [];
  const calledCoreRegistrars = new Set();
  /**
   * @param {string} owner
   * @param {string} method
   * @param {import('typescript').Expression|undefined} first
   * @param {string} [prefix]
   */
  const collectRoute = (owner, method, first, prefix = '') => {
    if (owner !== 'app' || !HTTP_METHODS.has(method) || !first || !ts.isStringLiteral(first)) return;
    const path = `${prefix}${first.text}`.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
    operations.push(`${method.toUpperCase()} ${path}`);
  };
  /** @param {import('typescript').Node} node */
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const owner = node.expression.expression.getText(tree);
      const method = node.expression.name.text.toLowerCase();
      const first = node.arguments[0];
      if ((owner === 'app' || owner === 'api') && HTTP_METHODS.has(method) && first && ts.isStringLiteral(first)) {
        const prefix = owner === 'api' ? '/api' : '';
        collectRoute('app', method, first, prefix);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.arguments[0]?.getText(tree) === 'app') calledCoreRegistrars.add(node.expression.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);

  // Console delegates /openapi.yaml and /v1/info registration to service-core. Inspect only the
  // registrar functions the Console actually calls, deriving their literal routes from the
  // installed implementation instead of special-casing either operation here.
  const corePath = fileURLToPath(import.meta.resolve('@atc-web/service-core/fastify'));
  const coreSource = readFileSync(corePath, 'utf8');
  const coreTree = ts.createSourceFile(corePath, coreSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of coreTree.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !calledCoreRegistrars.has(statement.name.text)) continue;
    const registrarApp = statement.parameters[0]?.name.getText(coreTree);
    /** @param {import('typescript').Node} node */
    function visitRegistrar(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        collectRoute(node.expression.expression.getText(coreTree), node.expression.name.text.toLowerCase(), node.arguments[0]);
      }
      ts.forEachChild(node, visitRegistrar);
    }
    if (registrarApp === 'app') visitRegistrar(statement);
  }
  return operations;
}

test('migration gate: current Fastify source exactly matches canonical OpenAPI', () => {
  const canonical = openApiOperations();
  const implementation = fastifyOperations();
  const duplicate = implementation.filter((value, index) => implementation.indexOf(value) !== index);
  assert.deepEqual(duplicate, [], `duplicate Fastify operations: ${duplicate.join(', ')}`);
  assert.equal(canonical.paths, 122);
  assert.equal(canonical.operations.length, 156);
  assert.equal(implementation.length, 156);
  assert.deepEqual([...implementation].sort(), [...canonical.operations].sort());
});
