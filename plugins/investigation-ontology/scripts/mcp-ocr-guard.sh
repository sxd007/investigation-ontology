#!/usr/bin/env bash
# ============================================================================
# mcp-ocr-guard.sh — Shell-level pre-filter for OCR MCP guard
#
# Reads hook stdin, does a fast string check for paddleOCR-mcp / pp_structurev3.
# Only spawns node when the call targets OCR MCP — non-OCR MCP calls exit in ~5ms
# instead of paying the ~50ms node startup cost.
#
# Called by hooks.json PreToolUse matcher "mcp_call_tool".
# ============================================================================

input=$(cat)

# Fast string check — if stdin doesn't mention OCR MCP, exit immediately
echo "$input" | grep -qE 'paddleOCR-mcp|pp_structurev3' || exit 0

# OCR MCP call detected — spawn node for full guard logic
echo "$input" | node "$(dirname "$0")/run-hook.mjs" mcp-ocr-guard
