#!/usr/bin/env node
// ============================================================================
// run-hook.mjs — 跨平台 Hook 启动器
//
// Claude Code / CodeBuddy 的 hooks.json 通过 `node run-hook.mjs <hook>` 调用本文件。
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
//   node run-hook.mjs validate-case-file  # PostToolUse registry/node/ontology 校验
//
// 文档依据：https://code.claude.com/docs/en/hooks
// ============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const hook = process.argv[2];
// 优先用平台注入的环境变量；都没有时从脚本自身位置推导（scripts/ 的上级即插件根目录）
const __scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CODEBUDDY_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || join(__scriptDir, '..');
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
  // CodeBuddy: ~/.codebuddy/plugins/config/efio/team-profile.md
  // Claude Code: ~/.claude/plugins/config/cc-investigation/team-profile.md
  const cfgCodeBuddy = join(os.homedir(), '.codebuddy', 'plugins', 'config', 'efio', 'team-profile.md');
  const cfgClaude = join(os.homedir(), '.claude', 'plugins', 'config', 'cc-investigation', 'team-profile.md');
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
  for (const cfg of [cfgCodeBuddy, cfgClaude]) {
    try {
      if (existsSync(cfg) && !readFileSync(cfg, 'utf8').includes('[PLACEHOLDER]')) {
        ready = true;
        break;
      }
    } catch {
      /* ignore */
    }
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

  // ── INVESTIGATION-HANDBOOK.md 部署 + 平台上下文文件注入 ──
  injectHandbook();
}

// ── 自愈式注入：确保工作区有手册 + IDE 上下文文件有完整操作指南 ──
function injectHandbook() {
  const cwd = process.cwd();
  const handbookPath = join(cwd, 'INVESTIGATION-HANDBOOK.md');
  const templatePath = join(pluginRoot, 'project-templates', 'default', 'INVESTIGATION-HANDBOOK.md');

  // ① 手册不存在 → 从插件模板复制
  if (!existsSync(handbookPath)) {
    if (existsSync(templatePath)) {
      try {
        copyFileSync(templatePath, handbookPath);
      } catch {
        /* 权限或路径问题 — 静默跳过，不阻塞 session */
        return;
      }
    } else {
      return; // 模板也不存在（插件安装异常）— 静默跳过
    }
  }

  // ② 平台检测 → 确定目标上下文文件
  let targetFile;
  if (process.env.CODEBUDDY_PLUGIN_ROOT) {
    targetFile = 'CODEBUDDY.md';
  } else if (process.env.CLAUDE_PLUGIN_ROOT) {
    targetFile = 'CLAUDE.md';
  } else {
    targetFile = 'CODEX.md'; // Codex 降级
  }
  const targetPath = join(cwd, targetFile);

  // ③ 读取手册完整内容（全量注入，不提取标记段）
  let handbookContent;
  try {
    handbookContent = readFileSync(handbookPath, 'utf8');
  } catch {
    return;
  }

  const START = '<!-- efio:handbook-start -->';
  const END = '<!-- efio:handbook-end -->';
  const injectContent = `${START}\n${handbookContent}\n${END}`;

  // ④ 读取目标文件当前内容
  let targetContent = '';
  try {
    if (existsSync(targetPath)) {
      targetContent = readFileSync(targetPath, 'utf8');
    }
  } catch {
    /* ignore */
  }

  // ⑤ 检查标记段是否已存在且内容一致
  const existStart = targetContent.indexOf(START);
  const existEnd = targetContent.indexOf(END);

  if (existStart !== -1 && existEnd !== -1 && existEnd > existStart) {
    // 标记段已存在
    const existingSection = targetContent.substring(existStart, existEnd + END.length);
    if (existingSection === injectContent) {
      return; // 内容一致，无需更新
    }
    // 内容过期 → 替换标记段（保留 IDE 生成的前后内容）
    const before = targetContent.substring(0, existStart);
    const after = targetContent.substring(existEnd + END.length);
    targetContent = before + injectContent + after;
  } else {
    // 标记段不存在 → 追加到文件末尾
    targetContent = targetContent.trimEnd() + '\n\n' + injectContent + '\n';
  }

  // ⑥ 写入目标文件
  try {
    writeFileSync(targetPath, targetContent, 'utf8');
  } catch {
    /* 写入失败 — 静默跳过，不阻塞 session */
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
  // 兼容 CodeBuddy (filePath) 和 Claude Code (file_path) 两种字段命名
  const ti = data?.tool_input || {};
  const fp = ti.file_path || ti.filePath || ti.path || '';
  const cwd = data?.cwd || process.cwd();
  if (/(^|[/\\])cases[/\\]/.test(fp) || /(^|[/\\])cases([/\\]|$)/.test(cwd)) {
    console.log(
      '[investigation-ontology] 案件文件操作 — 检查: 1) 文件名带序号前缀(01_) 2) 多版本文件带日期后缀(_YYYYMMDD) 3) 文件头尾有关联索引'
    );
  }
}

// ── PreToolUse：拦截直接调用 paddleOCR-mcp，提醒走 document-parsing 技能 ──
function mcpOcrGuard() {
  const raw = readStdin();

  // Fast pre-filter: skip JSON parse entirely for non-OCR MCP calls
  if (!raw || (!raw.includes('paddleOCR-mcp') && !raw.includes('pp_structurev3'))) {
    return;
  }

  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    /* stdin 解析失败 — 静默跳过，不阻止 MCP 调用 */
    return;
  }
  const toolInput = data?.tool_input || data?.toolInput || data || {};
  const serverName = toolInput?.serverName || '';
  const toolName = toolInput?.toolName || toolInput?.name || '';

  if (serverName === 'paddleOCR-mcp' || toolName === 'pp_structurev3') {
    console.log('[investigation-ontology] ⚠️ 检测到直接调用 paddleOCR-mcp / pp_structurev3。');
    console.log('[investigation-ontology] OCR MCP 是 document-parsing 技能的解析后端，不应被直接调用。');
    console.log('[investigation-ontology] 请先加载 document-parsing 技能（use_skill "document-parsing"）或使用 /efio:parse 命令。');
    console.log('[investigation-ontology] 技能工作流负责：文档类型识别 → 格式路由（仅图片/扫描PDF走OCR）→ schema结构化 → 质量评估 → 版本管理 → 写入 raw/parsed/。');
    console.log('[investigation-ontology] 如果当前确实是在 document-parsing 技能工作流内调用 OCR（Step 2-3），请忽略此提醒。');
  }
}

// ── PostToolUse：校验案件文件与 global_ontology YAML ─────────────
function validateCaseFile() {
  let data = {};
  try {
    data = JSON.parse(readStdin() || '{}');
  } catch {
    return;
  }

  const ti = data?.tool_input || data?.toolInput || {};
  const filePath = ti.file_path || ti.filePath || ti.path || '';
  if (!filePath) return;
  const toolName = data?.tool_name || data?.toolName || '';
  const isDelete = toolName === 'delete_file' || toolName === 'Delete';

  const normalized = String(filePath).replace(/\\/g, '/');
  const isRegistry = /(^|\/)evidence_registry\.json$/i.test(normalized);
  const isNode = /(^|\/)nodes\/[^/]+\.(md|json)$/i.test(normalized);
  const isOntology = /(^|\/)global_ontology\/(entities\/[^/]+|relations)\/[^/]+\.ya?ml$/i.test(normalized);
  if (!isRegistry && !isNode && !isOntology) return;

  const cwd = data?.cwd || process.cwd();
  const absPath = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
  // 删除 registry/节点后，目标文件已不存在，但仍需校验其所在案件以发现断链。
  if (!existsSync(absPath) && !(isDelete && (isRegistry || isNode))) return;

  if (isOntology) {
    const validator = join(pluginRoot, 'scripts', 'validate-ontology.mjs');
    if (!existsSync(validator)) {
      emitPostToolContext(`⚠️ [Ontology Schema] 无法找到校验器: ${validator}`);
      return;
    }
    const result = spawnSync(process.execPath, [validator, absPath], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const summary = output.match(/本体校验:\s*(\d+) ERROR,\s*(\d+) WARN/);
    const hasIssues = result.status !== 0 || (summary && (Number(summary[1]) > 0 || Number(summary[2]) > 0));
    if (!hasIssues) return;
    const clipped = output.length > 7000 ? `${output.slice(0, 7000)}\n…输出已截断` : output;
    emitPostToolContext(`⚠️ [Ontology Schema] ${basename(filePath)} 写入后校验未通过。请修复本体结构或引用；不要绕过 Action 治理。\n${clipped}`);
    return;
  }

  const caseDir = isRegistry ? dirname(absPath) : dirname(dirname(absPath));
  const scanner = join(pluginRoot, 'skills', 'evidence-management', 'scripts', 'scan-chain.js');
  if (!existsSync(scanner)) {
    emitPostToolContext(`⚠️ [Case Schema] 无法找到校验器: ${scanner}`);
    return;
  }

  const result = spawnSync(process.execPath, [scanner, caseDir, '--validate'], {
    cwd: caseDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const summary = output.match(/(\d+) ERROR,\s*(\d+) WARN/);
  const hasIssues = result.status !== 0 || (summary && (Number(summary[1]) > 0 || Number(summary[2]) > 0));
  if (!hasIssues) return;

  const clipped = output.length > 7000 ? `${output.slice(0, 7000)}\n…输出已截断` : output;
  emitPostToolContext(
    `⚠️ [Case Schema] ${basename(filePath)} 写入后校验未通过。请根据以下结果立即修复；不要忽略或通过修改可视化数据绕过规范。\n${clipped}`
  );
}

function emitPostToolContext(additionalContext) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  }));
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
  case 'validate-case-file':
    validateCaseFile();
    break;
  default:
    process.exit(0);
}
