#!/usr/bin/env node
// ============================================================================
// run-hook.mjs — 工作空间级 Hook 调度器（根目录机制，非插件功能）
//
// 位置：<workspace-root>/scripts/run-hook.mjs
// 配置：<workspace-root>/hooks/hooks.json  （工具无关的 PreToolUse 声明）
//
// 设计原则：
//   • 这是「当前工作空间」的保护机制，独立于 plugins/ 下任一插件的打包产物。
//   • 工具无关：配置与调度器都由本仓库自持，不依赖具体 agent 平台注入的
//     PLUGIN_ROOT；由本工作空间自己的调度流程（即本文件 + hooks/hooks.json）
//     调用，而非作为插件功能随 plugins/ 分发。
//   • 当前承载：workspace-write-guard（工作空间边界硬约束）。
//
// 用法：
//   node scripts/run-hook.mjs workspace-write-guard
//
// 平台 hook 文档（参考）：https://code.claude.com/docs/en/hooks
// ============================================================================

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve, relative } from 'node:path';

const hook = process.argv[2];

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// ── PreToolUse：工作空间边界硬约束（双仓分层架构）─────────────────
// 原则：
//   1) 允许对本工作空间外的文件进行【只读】访问（read_file / search 等）；
//   2) 绝对禁止在本工作空间外执行任何写入 / 删除；
//   3) 需要修改外部仓库（如 Ontology/ontology_domain/）时，必须在本工作空间
//      docs/ 下生成「外部变更请求」建议操作文档，交由外部工作空间的 agent 执行。
// 实现：将工具目标路径解析为绝对路径，与工作空间根（cwd）比较；越界即拒绝。
function workspaceWriteGuard() {
  let data = {};
  try {
    data = JSON.parse(readStdin() || '{}');
  } catch {
    return; // 无法解析 → fail open，交由其他校验兜底
  }
  const ti = data?.tool_input || data?.toolInput || {};
  // 兼容各平台字段命名：filePath / file_path / path / target_file(delete_file)
  const filePath = ti.filePath || ti.file_path || ti.path || ti.target_file || '';
  if (!filePath) return; // 无目标路径的工具不拦截（如纯 stdout 工具）

  const cwd = data?.cwd || process.cwd();
  const absRoot = resolve(cwd);
  const absTarget = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);

  const rel = relative(absRoot, absTarget);
  const isOutside = rel !== '' && (rel.startsWith('..') || isAbsolute(rel));

  if (isOutside) {
    const reason =
      `[workspace-write-guard] 已拦截：目标文件位于当前工作空间之外。\n` +
      `  目标路径   : ${filePath}\n` +
      `  工作空间根 : ${absRoot}\n\n` +
      `根据调查工具箱边界纪律（双仓分层架构）：\n` +
      `  • 仅允许对外部文件做【只读】访问；\n` +
      `  • 禁止在本工作空间之外写入 / 删除；\n` +
      `  • 如需修改外部仓库，请在本工作空间 docs/ 下生成「外部变更请求」\n` +
      `    建议操作文档，交由该外部工作空间的 agent 执行。`;
    process.stderr.write(reason + '\n');
    process.exit(2); // 非 0 退出 → 拒绝工具调用
  }
  // 位于工作空间内 → 放行（不输出、不影响其他 hook）
}

switch (hook) {
  case 'workspace-write-guard':
    workspaceWriteGuard();
    break;
  default:
    process.exit(0);
}
