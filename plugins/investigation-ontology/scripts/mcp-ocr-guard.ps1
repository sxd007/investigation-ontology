# ============================================================================
# mcp-ocr-guard.ps1 — OCR MCP guard pre-filter for Windows/PowerShell
#
# STATUS: Not currently used by hooks.json.
#
# This script was intended to pre-filter MCP calls and only spawn node when
# paddleOCR-mcp is detected. However, PowerShell's pipe to native commands
# (node) has encoding issues with JSON on Windows — the string pre-filter
# works (non-OCR calls correctly skip), but piping stdin to node fails to
# produce the guard's warning output.
#
# hooks.json for CodeBuddy uses `node run-hook.mjs mcp-ocr-guard` directly
# instead. The mcpOcrGuard() function in run-hook.mjs does a fast string
# check on stdin before parsing JSON, so non-OCR calls exit quickly (~5ms
# after node startup). The ~50ms node startup overhead per MCP call is
# accepted as a tradeoff for Windows compatibility.
#
# Claude Code (Unix) uses mcp-ocr-guard.sh with grep pre-filter, which works
# correctly because bash pipes preserve UTF-8 encoding.
# ============================================================================

$rawInput = [Console]::In.ReadToEnd()

# Fast string check — if stdin doesn't mention OCR MCP, exit immediately
if ($rawInput -notmatch 'paddleOCR-mcp|pp_structurev3') { exit 0 }

# OCR MCP call detected — the pipe to node below has encoding issues on Windows.
# CodeBuddy hooks.json uses direct `node run-hook.mjs mcp-ocr-guard` instead.
Write-Host "[investigation-ontology] ⚠️ 检测到直接调用 paddleOCR-mcp / pp_structurev3。"
Write-Host "[investigation-ontology] OCR MCP 是 document-parsing 技能的解析后端，不应被直接调用。"
Write-Host "[investigation-ontology] 请先加载 document-parsing 技能（use_skill `"document-parsing`"）或使用 /efio:parse 命令。"
Write-Host "[investigation-ontology] 如果当前确实是在 document-parsing 技能工作流内调用 OCR（Step 2-3），请忽略此提醒。"
