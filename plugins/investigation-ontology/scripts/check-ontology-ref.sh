#!/bin/bash
# ============================================================================
# check-ontology-ref.sh — PostToolUse Hook
#
# Claude Code 在 Write/Edit 工具成功执行后触发此脚本。
# 如果写入目标是 nodes/ENT-*.json 或 nodes/EV-*.json，
# 检查 ontology_ref 字段是否存在且指向有效文件。
#
# 返回值：
#   exit 0 + additionalContext → 向 Claude 注入警告（不阻断）
#   exit 0 + 无输出            → 一切正常
#
# 文档依据：https://code.claude.com/docs/en/hooks
# ============================================================================

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\s*:\s*"//;s/"$//')
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"tool_name"\s*:\s*"//;s/"$//')
CWD=$(echo "$INPUT" | grep -o '"cwd"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"cwd"\s*:\s*"//;s/"$//')

# ── 路径匹配：只检查 ENT 和 EV 节点 ──────────────────────────────
case "$FILE_PATH" in
  */nodes/ENT-*|*/nodes/EV-*|nodes/ENT-*|nodes/EV-*)
    ;;  # 匹配，继续检查
  *)
    exit 0  # 不匹配，放行
    ;;
esac

# ── 构建绝对路径 ──────────────────────────────────────────────────
if [[ "$FILE_PATH" == /* ]]; then
  ABS_PATH="$FILE_PATH"
else
  ABS_PATH="${CWD%/}/$FILE_PATH"
fi

if [ ! -f "$ABS_PATH" ]; then
  exit 0
fi

# ── 检查 ontology_ref 是否存在 ─────────────────────────────────────
MISSING=""

# 检查 ontology_ref 字段
if ! grep -q '"ontology_ref"' "$ABS_PATH" 2>/dev/null && ! grep -q 'ontology_ref' "$ABS_PATH" 2>/dev/null; then
  MISSING="ontology_ref"
fi

# 如果有缺失，注入警告
if [ -n "$MISSING" ]; then
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "⚠️ [Binding Protocol] 文件 $FILE_PATH 缺少 ontology_ref 字段。请立即补充指向 global_ontology/entities/ 中对应本体对象的引用。实体节点引用 global_ontology/entities/{person,organization,account}/，证据节点引用 global_ontology/entities/evidence/。详见 skills/ontology/references/binding-protocol.md。"
  }
}
JSON
  exit 0
fi

# ── 检查 ontology_ref 指向的对象是否有效 ──────────────────────────
# 提取 object_id
OBJECT_ID=$(grep -o '"object_id"\s*:\s*"[^"]*"' "$ABS_PATH" 2>/dev/null | head -1 | sed 's/.*"object_id"\s*:\s*"//;s/"$//')
OBJECT_TYPE=$(grep -o '"object_type"\s*:\s*"[^"]*"' "$ABS_PATH" 2>/dev/null | head -1 | sed 's/.*"object_type"\s*:\s*"//;s/"$//')

if [ -n "$OBJECT_ID" ]; then
  # 根据类型查找对应的本体文件
  local target_dir=""
  case "$OBJECT_TYPE" in
    "Person")        target_dir="global_ontology/entities/person" ;;
    "Organization")  target_dir="global_ontology/entities/organization" ;;
    "Account")       target_dir="global_ontology/entities/account" ;;
    "Evidence")      target_dir="global_ontology/entities/evidence" ;;
    "Case")          target_dir="global_ontology/entities/case" ;;
    *)               target_dir="" ;;
  esac

  if [ -n "$target_dir" ]; then
    # 从文件所在目录向上查找到项目根目录
    local project_root="${CWD}"
    if [[ "$FILE_PATH" == *"/cases/"* ]]; then
      project_root=$(echo "$ABS_PATH" | sed 's|/cases/.*||')
    fi
    local entity_file=$(find "$project_root/$target_dir" -name "${OBJECT_ID}.yaml" 2>/dev/null | head -1)
    if [ -z "$entity_file" ]; then
      cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "⚠️ [Binding Protocol] $FILE_PATH 中 ontology_ref.object_id='$OBJECT_ID' 指向的文件不存在于 $target_dir/ 目录。请确认本体层已创建对应对象，或修正 object_id。"
  }
}
JSON
      exit 0
    fi
  fi
fi

exit 0