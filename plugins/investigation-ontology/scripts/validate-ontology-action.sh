#!/bin/bash
# ============================================================================
# validate-ontology-action.sh — PreToolUse Hook
#
# Claude Code 在调用 Write/Edit 工具前触发此脚本。
# 如果写入目标是 global_ontology/entities/ 或 global_ontology/relations/ 下的文件，脚本现场读取
# YAML 文件的实际状态，校验对应 Action 的前置条件。
#
# 返回值：
#   exit 0 + 无 stdout          → 放行
#   exit 0 + JSON deny         → 阻断（permissionDecision: deny）
#   exit 2 + stderr             → 阻断（stderr 反馈给 Claude）
#
# 文档依据：https://code.claude.com/docs/en/hooks
# ============================================================================

set -euo pipefail

# ── 读取 stdin JSON ────────────────────────────────────────────────
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\s*:\s*"//;s/"$//')
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"tool_name"\s*:\s*"//;s/"$//')
CWD=$(echo "$INPUT" | grep -o '"cwd"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"cwd"\s*:\s*"//;s/"$//')

# 提取 content（Write）或 new_string（Edit）
CONTENT=$(echo "$INPUT" | grep -o '"content"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"content"\s*:\s*"//;s/"$//')
NEW_STRING=$(echo "$INPUT" | grep -o '"new_string"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"new_string"\s*:\s*"//;s/"$//')
OLD_STRING=$(echo "$INPUT" | grep -o '"old_string"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"old_string"\s*:\s*"//;s/"$//')

# 合并内容：Edit 用 new_string，Write 用 content
PAYLOAD="${NEW_STRING:-$CONTENT}"

# ── 路径匹配：只处理 global_ontology/entities/ 和 global_ontology/relations/ ──
# 注意：file_path 可能是绝对路径或相对路径
case "$FILE_PATH" in
  */global_ontology/entities/*|*/global_ontology/relations/*|global_ontology/entities/*|global_ontology/relations/*)
    ;;  # 匹配，继续校验
  *)
    exit 0  # 不匹配，放行
    ;;
esac

# ── 构建文件系统路径 ──────────────────────────────────────────────
# 如果 file_path 是相对路径，基于 cwd 拼接
if [[ "$FILE_PATH" == /* ]]; then
  ABS_PATH="$FILE_PATH"
else
  ABS_PATH="${CWD%/}/$FILE_PATH"
fi

# ── Action 反查 & 前置条件校验 ────────────────────────────────────
# 根据路径和内容变化，确定对应的 Action 类型

deny() {
  local reason="$1"
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$reason"
  }
}
JSON
  exit 0
}

# ── 辅助函数：grep 提取 YAML 字段 ──────────────────────────────────
yaml_field() {
  # 从 YAML 文件中提取简单字段值
  # 用法: yaml_field <file> <key>
  # 支持 key: value 和 key: "value" 两种格式
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    echo ""
    return
  fi
  grep -E "^\s*${key}\s*:" "$file" 2>/dev/null | head -1 | sed "s/.*${key}\s*:\s*//;s/\"//g;s/'//g;s/\s*$//" || echo ""
}

yaml_list_contains() {
  # 检查 YAML 列表中是否包含某个值
  # 用法: yaml_list_contains <file> <list_key> <value>
  local file="$1"
  local list_key="$2"
  local value="$3"
  if [ ! -f "$file" ]; then
    return 1
  fi
  grep -q "$value" "$file" 2>/dev/null
}

# ── CLOSE_CASE 校验 ────────────────────────────────────────────────
check_close_case() {
  local case_file="$ABS_PATH"

  # 检查是否真的在写入 lifecycle_status: CLOSED
  if ! echo "$PAYLOAD" | grep -q "lifecycle_status\s*:\s*CLOSED"; then
    exit 0  # 不是结案操作，放行
  fi

  local case_dir=$(dirname "$case_file")

  # 1. 检查当前 lifecycle_status 是否为 ACTIVE
  local current_status=$(yaml_field "$case_file" "lifecycle_status")
  if [ "$current_status" != "ACTIVE" ]; then
    deny "[CLOSE_CASE] 案件当前 lifecycle_status 为 '$current_status'，不是 ACTIVE。只有 ACTIVE 状态的案件可以结案。"
  fi

  # 2. 检查涉及实体状态
  # 读取 involved_entities 列表
  if grep -q "involved_entities:" "$case_file" 2>/dev/null; then
    local entity_ids=$(grep -A50 "involved_entities:" "$case_file" | grep -E "^\s*-\s*" | sed 's/.*-\s*//;s/\"//g')
    for eid in $entity_ids; do
      # 查找实体文件
      local entity_file=$(find "$case_dir/../../entities" -name "${eid}.yaml" 2>/dev/null | head -1)
      if [ -z "$entity_file" ]; then
        # 尝试模糊匹配
        entity_file=$(find "$case_dir/../../entities" -name "*${eid}*" 2>/dev/null | head -1)
      fi
      if [ -n "$entity_file" ]; then
        local e_status=$(yaml_field "$entity_file" "lifecycle_status")
        if [ "$e_status" = "UNRESOLVED" ]; then
          deny "[CLOSE_CASE] Entity '$eid' 当前 lifecycle_status 为 UNRESOLVED。请先执行 RESOLVE_ENTITY。"
        fi
      fi
    done
  fi

  # 3. 检查证据冻结状态
  if grep -q "contained_evidence:" "$case_file" 2>/dev/null; then
    local ev_ids=$(grep -A50 "contained_evidence:" "$case_file" | grep -E "^\s*-\s*" | sed 's/.*-\s*//;s/\"//g')
    for evid in $ev_ids; do
      local ev_file=$(find "$case_dir/../../global_ontology/entities/evidence" -name "${evid}.yaml" 2>/dev/null | head -1)
      if [ -z "$ev_file" ]; then
        ev_file=$(find "$case_dir/../../global_ontology/entities/evidence" -name "*${evid}*" 2>/dev/null | head -1)
      fi
      if [ -n "$ev_file" ]; then
        local sealed=$(yaml_field "$ev_file" "sealed")
        if [ "$sealed" != "true" ]; then
          deny "[CLOSE_CASE] Evidence '$evid' 尚未冻结 (sealed 不是 true)。请先执行 SEAL_EVIDENCE。"
        fi
      fi
    done
  fi

  # 4. 运行 audit-binding.sh（Layer 4 巡检）
  local audit_script="${CLAUDE_PROJECT_DIR:-$CWD}/scripts/audit-binding.sh"
  if [ -x "$audit_script" ]; then
    local audit_output=$("$audit_script" 2>&1) || true
    if echo "$audit_output" | grep -qi "ERROR"; then
      deny "[CLOSE_CASE] Binding Protocol 审计未通过：\n$audit_output\n请先修复 ontology_ref 偏移后再结案。"
    fi
  fi

  # 全部通过
  exit 0
}

# ── ASSERT_RELATION 校验 ────────────────────────────────────────────
check_assert_relation() {
  # 判断是否为新创建的关系文件
  if [ -f "$ABS_PATH" ] && [ -s "$ABS_PATH" ]; then
    exit 0  # 文件已存在（编辑已有关系），放行
  fi

  # 新建设关系 → 检查 from_entity 和 to_entity
  local from_entity=$(echo "$PAYLOAD" | grep -o '"from_entity"\s*:\s*"[^"]*"' | sed 's/.*"from_entity"\s*:\s*"//;s/"$//' || echo "")
  local to_entity=$(echo "$PAYLOAD" | grep -o '"to_entity"\s*:\s*"[^"]*"' | sed 's/.*"to_entity"\s*:\s*"//;s/"$//' || echo "")
  # 也尝试 YAML 格式
  from_entity="${from_entity:-$(echo "$PAYLOAD" | grep "from_entity:" | head -1 | sed 's/.*from_entity:\s*//;s/\"//g' || echo "")}"
  to_entity="${to_entity:-$(echo "$PAYLOAD" | grep "to_entity:" | head -1 | sed 's/.*to_entity:\s*//;s/\"//g' || echo "")}"

  # 检查 source_evidence_refs 非空
  if ! echo "$PAYLOAD" | grep -q "source_evidence_refs:"; then
    deny "[ASSERT_RELATION] 缺少 source_evidence_refs。关系必须绑定至少一条证据。"
  fi

  # 现场查询 from_entity 和 to_entity 的状态
  if [ -n "$from_entity" ]; then
    local from_file=$(find "$(dirname "$ABS_PATH")/../entities" -name "${from_entity}.yaml" 2>/dev/null | head -1)
    if [ -n "$from_file" ]; then
      local from_status=$(yaml_field "$from_file" "lifecycle_status")
      if [ "$from_status" = "UNRESOLVED" ]; then
        deny "[ASSERT_RELATION] from_entity '$from_entity' 当前 lifecycle_status 为 UNRESOLVED。关系不能引用未解析的实体。"
      fi
      local from_superseded=$(yaml_field "$from_file" "superseded_by")
      if [ -n "$from_superseded" ] && [ "$from_superseded" != "null" ]; then
        deny "[ASSERT_RELATION] from_entity '$from_entity' 已被 '$from_superseded' 替代。请使用替代后的实体。"
      fi
    fi
  fi

  if [ -n "$to_entity" ]; then
    local to_file=$(find "$(dirname "$ABS_PATH")/../entities" -name "${to_entity}.yaml" 2>/dev/null | head -1)
    if [ -n "$to_file" ]; then
      local to_status=$(yaml_field "$to_file" "lifecycle_status")
      if [ "$to_status" = "UNRESOLVED" ]; then
        deny "[ASSERT_RELATION] to_entity '$to_entity' 当前 lifecycle_status 为 UNRESOLVED。关系不能引用未解析的实体。"
      fi
      local to_superseded=$(yaml_field "$to_file" "superseded_by")
      if [ -n "$to_superseded" ] && [ "$to_superseded" != "null" ]; then
        deny "[ASSERT_RELATION] to_entity '$to_entity' 已被 '$to_superseded' 替代。请使用替代后的实体。"
      fi
    fi
  fi

  exit 0
}

# ── RESOLVE_ENTITY 校验 ────────────────────────────────────────────
check_resolve_entity() {
  # 检查 lifecycle_status 是否从 UNRESOLVED 变为 VERIFIED
  if ! echo "$PAYLOAD" | grep -q "lifecycle_status\s*:\s*VERIFIED"; then
    exit 0  # 不是核实操作，放行
  fi

  local current_status=""
  if [ -f "$ABS_PATH" ]; then
    current_status=$(yaml_field "$ABS_PATH" "lifecycle_status")
  fi

  if [ "$current_status" != "UNRESOLVED" ] && [ -n "$current_status" ]; then
    deny "[RESOLVE_ENTITY] 实体当前 lifecycle_status 为 '$current_status'，不是 UNRESOLVED。只有 UNRESOLVED 实体可以核实。"
  fi

  # 身份唯一性检查：检查是否有同名实体已被 VERIFIED
  local entity_name=$(echo "$PAYLOAD" | grep "name_primary:" | head -1 | sed 's/.*name_primary:\s*//;s/\"//g' || echo "")
  if [ -z "$entity_name" ] && [ -f "$ABS_PATH" ]; then
    entity_name=$(yaml_field "$ABS_PATH" "name_primary")
  fi

  if [ -n "$entity_name" ]; then
    local entity_type=$(basename "$(dirname "$ABS_PATH")")
    local dup=$(grep -rl "name_primary:\s*${entity_name}" "$(dirname "$ABS_PATH")" 2>/dev/null | grep -v "$ABS_PATH" || echo "")
    if [ -n "$dup" ]; then
      # 检查重名实体是否已被 VERIFIED
      local dup_status=$(yaml_field "$dup" "lifecycle_status")
      if [ "$dup_status" = "VERIFIED" ]; then
        deny "[RESOLVE_ENTITY] 发现同名 VERIFIED 实体 '$entity_name' (${dup})。请先执行 MERGE_ENTITIES 合并后再核实。"
      fi
    fi
  fi

  exit 0
}

# ── SEAL_EVIDENCE 校验 ──────────────────────────────────────────────
check_seal_evidence() {
  # 检查 sealed 是否从 false 变为 true
  if ! echo "$PAYLOAD" | grep -q "sealed\s*:\s*true"; then
    exit 0  # 不是冻结操作，放行
  fi

  local current_sealed=""
  if [ -f "$ABS_PATH" ]; then
    current_sealed=$(yaml_field "$ABS_PATH" "sealed")
  fi

  if [ "$current_sealed" = "true" ]; then
    deny "[SEAL_EVIDENCE] 证据已处于 sealed 状态，不能重复冻结。"
  fi

  # 检查关联的 Relation 是否有被 SUPERSEDED 的
  local ev_id=$(basename "$ABS_PATH" .yaml)
  local relations_dir="$(dirname "$ABS_PATH")/../../relations"
  if [ -d "$relations_dir" ]; then
    local superseded_rels=$(grep -rl "source_evidence_refs.*${ev_id}" "$relations_dir" 2>/dev/null | while read rf; do
      local ss=$(yaml_field "$rf" "superseded_by")
      if [ -n "$ss" ] && [ "$ss" != "null" ]; then
        echo "$rf (被 $ss 替代)"
      fi
    done)
    if [ -n "$superseded_rels" ]; then
      deny "[SEAL_EVIDENCE] 以下关联关系已被替代，冻结前请确认：\n$superseded_rels"
    fi
  fi

  exit 0
}

# ── ADMIT_CANDIDATE 校验 ────────────────────────────────────────────
check_admit_candidate() {
  # 新创建实体/关系（文件尚不存在）
  if [ -f "$ABS_PATH" ] && [ -s "$ABS_PATH" ]; then
    exit 0  # 文件已存在，不是新建，放行
  fi

  # 检查是否有 superseded_by 引用的实体仍有效
  # 这是预防性检查：新实体不应引用已废弃的 ID
  local refs=$(echo "$PAYLOAD" | grep -oP '(?<=source_evidence_ref:\s*")[^"]*' || echo "")
  if [ -n "$refs" ]; then
    for ref in $refs; do
      local ev_file=$(find "$(dirname "$ABS_PATH")/../evidence" -name "${ref}.yaml" 2>/dev/null | head -1)
      if [ -n "$ev_file" ]; then
        local ev_sealed=$(yaml_field "$ev_file" "sealed")
        # 允许引用已冻结的证据（证据冻结是正向状态）
      fi
    done
  fi

  exit 0
}

# ── 主路由：根据路径分发到具体校验函数 ────────────────────────────
case "$FILE_PATH" in
  */global_ontology/entities/case/*|global_ontology/entities/case/*)
    check_close_case
    ;;
  */global_ontology/entities/evidence/*|global_ontology/entities/evidence/*)
    check_seal_evidence
    ;;
  */global_ontology/entities/person/*|*/global_ontology/entities/organization/*|*/global_ontology/entities/account/*|global_ontology/entities/person/*|global_ontology/entities/organization/*|global_ontology/entities/account/*)
    check_resolve_entity
    ;;
  */global_ontology/relations/*|global_ontology/relations/*)
    check_assert_relation
    ;;
  *)
    exit 0
    ;;
esac