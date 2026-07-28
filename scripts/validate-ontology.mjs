#!/usr/bin/env node
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { findProjectRoot, loadOntology } = require('./ontology-validation.cjs');

const start = resolve(process.argv[2] || process.cwd());
const projectRoot = findProjectRoot(start);
if (!projectRoot) {
  console.error(`🔴 [ontology_root_missing] 从 ${start} 未找到 global_ontology/`);
  process.exit(1);
}

const { issues, objects, relations } = loadOntology(projectRoot);
const levels = { ERROR: '🔴', WARN: '🟡', INFO: '🔵' };
const errors = issues.filter((item) => item.severity === 'ERROR');
const warns = issues.filter((item) => item.severity === 'WARN');
const infos = issues.filter((item) => item.severity === 'INFO');
console.log(`📋 本体校验: ${errors.length} ERROR, ${warns.length} WARN, ${infos.length} INFO (${objects.size} 对象, ${relations.length} 关系)`);
for (const item of issues) console.log(`  ${levels[item.severity]} [${item.type}] ${item.message}`);
if (errors.length) process.exit(1);
