import { assertEquals } from "@std/assert";

import { DependencyParser } from '../src/core/dependency-parser.ts'
import { TypesManager } from '../src/core/types-manager.ts'

const registry = "https://registry.npmjs.org";
const code = `
import { debounce } from "jsr:@std/async";
import { assertEquals } from "jsr:@std/assert";
import fetch from 'npm:node-fetch';
import fs from 'npm:fs-extra@10.0.0'
import express from 'express'
`;

const typesManager = new TypesManager({ registry, debounce: 200, verbose: true, maxConcurrency: 4, builtins: { typescript: true, node: true, deno: true, bun: false }}, console)

Deno.test("getImportsFromSourceCode", () => {
  const imports = DependencyParser.getImportsFromSourceCode(code);
  assertEquals(imports, [
    "jsr:@std/async",
    "jsr:@std/assert",
    "npm:node-fetch",
    "npm:fs-extra@10.0.0",
    "express",
  ]);
});

Deno.test("getDependenciesFromImports", () => {
  const imports = DependencyParser.getImportsFromSourceCode(code);
  const dependencies = DependencyParser.getDependenciesFromImports(imports);
  assertEquals(dependencies, [
    { name: "@std/async", version: "", registry: "jsr" },
    { name: "@std/assert", version: "", registry: "jsr" },
    { name: "node-fetch", version: "", registry: "npm" },
    { name: "fs-extra", version: "10.0.0", registry: "npm" },
    { name: "express", version: "", registry: "" },
  ]);
});

Deno.test("getBuiltinTypes#deno", async () => {
  const types = await typesManager.fetchBuiltinTypes(
    'deno'
  );
});

Deno.test("getBuiltinTypes#node", async () => {
  const types = await typesManager.fetchBuiltinTypes(
    'node'
  );
});

Deno.test("getBuiltinTypes#typescript", async () => {
  const types = await typesManager.fetchBuiltinTypes(
    'typescript',
  );
});

Deno.test("getDependencyTypes#jsr:@std/async", async () => {
  const types = await typesManager.fetchDependencyTypes(
    { name: "@std/async", version: "", registry: "jsr" },
  );
});

Deno.test("getDependencyTypes#npm:dayjs", async () => {
  const types = await typesManager.fetchDependencyTypes(
    { name: "dayjs", version: "", registry: "npm" },
  );
});
