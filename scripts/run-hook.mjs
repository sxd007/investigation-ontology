#!/usr/bin/env node
// ============================================================================
// run-hook.mjs — 跨平台 Hook 启动器
//
// Claude Code 的 hooks.json 通过 `node run-hook.mjs <hook>` 调用本文件。
// node 在 Windows / macOS / Linux 上行为一致且始终在 PATH 中，因此用它作为
// 统一入口：简单逻辑（SessionStart、命名提醒）直接在 JS 中实现；复杂的本体
// 校验逻辑则按操作系统分发到已有的 .sh（bash）或 .ps1（PowerShell）脚本，
// 复用两套已测试实现，避免重复维护。
//
// 用法：
//   node run-hook.mjs session-start       # SessionStart
//   node run-hook.mjs pre-write-naming    # PreToolUse 命名规范提醒
//   node run-hook.mjs mcp-ocr-guard       # PreToolUse OCR MCP 直接调用拦截提醒
//   node run-hook.mjs validate-action     # PreToolUse 本体 Action 前置校验
//   node run-hook.mjs check-ref           # PostToolUse ontology_ref 完整性检查
//
// 文档依据：https://code.claude.com/docs/en/hooks
// ============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const hook = process.argv[2];
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const isWin = process.platform === 'win32';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// ── 分发到已有的 .sh / .ps1 脚本（保留两套已测试实现）──────────────
function runScript(base) {
  const scriptsDir = join(pluginRoot, 'scripts');
  let cmd, args;
  if (isWin) {
    cmd = 'powershell';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(scriptsDir, `${base}.ps1`)];
  } else {
    cmd = 'bash';
    args = [join(scriptsDir, `${base}.sh`)];
  }
  // stdio: 'inherit' → 子进程直接读取本进程的 stdin（Claude 注入的 hook JSON），
  // 输出 / 退出码也原样透传给 Claude。
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}

// ── SessionStart：检查配置状态、统计活跃案件、给出可执行提示 ──────
function sessionStart() {
  const cfg = join(os.homedir(), '.claude', 'plugins', 'config', 'investigation-ontology', 'team-profile.md');
  let active = 0;
  try {
    const casesDir = join(process.cwd(), 'cases');
    if (existsSync(casesDir)) {
      active = readdirSync(casesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
    }
  } catch {
    /* ignore */
  }
  let ready = false;
  try {
    ready = existsSync(cfg) && !readFileSync(cfg, 'utf8').includes('[PLACEHOLDER]');
  } catch {
    /* ignore */
  }
  if (ready) {
    console.log('[investigation-ontology] 调查工具包已加载。');
    console.log(
      active > 0
        ? `[investigation-ontology] 当前目录有 ${active} 个案件，运行 /investigate list 查看`
        : '[investigation-ontology] 运行 /investigate new 启动新案件'
    );
  } else {
    console.log('[investigation-ontology] 首次使用? 运行 /efio:cold-start 完成设置');
  }
}

// ── PreToolUse：案件目录下的写操作给出命名规范提醒 ────────────────
function preWriteNaming() {
  let data = {};
  try {
    data = JSON.parse(readStdin() || '{}');
  } catch {
    /* ignore */
  }
  const fp = data?.tool_input?.file_path || '';
  const cwd = data?.cwd || process.cwd();
  if (/(^|[/\\])cases[/\\]/.test(fp) || /(^|[/\\])cases([/\\]|$)/.test(cwd)) {
    console.log(
      '[investigation-ontology] 案件文件操作 — 检查: 1) 文件名带序号前缀(01_) 2) 多版本文件带日期后缀(_YYYYMMDD) 3) 文件头尾有关联索引'
    );
  }
}

// ── PreToolUse：拦截直接调用 paddleOCR-mcp，提醒走 document-parsing 技能 ──
function mcpOcrGuard() {
  let data = {};
  try {
    data = JSON.parse(readStdin() || '{}');
  } catch {
    /* ignore */
  }
  const toolInput = data?.tool_input || {};
  const serverName = toolInput?.serverName || '';
  const toolName = toolInput?.toolName || '';

  if (serverName === 'paddleOCR-mcp' || toolName === 'pp_structurev3') {
    console.log('[investigation-ontology] ⚠️ 检测到直接调用 paddleOCR-mcp / pp_structurev3。');
    console.log('[investigation-ontology] OCR MCP 是 document-parsing 技能的解析后端，不应被直接调用。');
    console.log('[investigation-ontology] 请先加载 document-parsing 技能（use_skill "document-parsing"）或使用 /efio:parse 命令。');
    console.log('[investigation-ontology] 技能工作流负责：文档类型识别 → 格式路由（仅图片/扫描PDF走OCR）→ schema结构化 → 质量评估 → 版本管理 → 写入 raw/parsed/。');
    console.log('[investigation-ontology] 如果当前确实是在 document-parsing 技能工作流内调用 OCR（Step 2-3），请忽略此提醒。');
  }
}

switch (hook) {
  case 'session-start':
    sessionStart();
    break;
  case 'pre-write-naming':
    preWriteNaming();
    break;
  case 'mcp-ocr-guard':
    mcpOcrGuard();
    break;
  case 'validate-action':
    runScript('validate-ontology-action');
    break;
  case 'check-ref':
    runScript('check-ontology-ref');
    break;
  default:
    process.exit(0);
}
