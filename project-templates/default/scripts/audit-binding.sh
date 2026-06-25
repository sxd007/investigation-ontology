#!/bin/bash
# audit-binding.sh — Binding Protocol 定期巡检脚本（Layer 4 防御）
# 用法: ./scripts/audit-binding.sh <case_id>
# 功能: 扫描认知层节点的 ontology_ref，检查与本体层的一致性
#
# 返回码:
#   0 - 所有检查通过
#   1 - 发现偏移（ERROR）
#   2 - 参数错误

set -euo pipefail

CASE_ID="${1:-}"
if [ -z "$CASE_ID" ]; then
  echo "用法: $0 <case_id>"
  echo "示例: $0 CASE-2026-001"
  exit 2
fi

CASE_DIR="cases/$CASE_ID"
ERRORS=0

echo "=== Binding Protocol 巡检: $CASE_ID ==="
echo ""

# ---- 检查 1: ENT 节点的 ontology_ref ----
echo "--- 1. ENT 节点 ontology_ref 检查 ---"
for node_file in "$CASE_DIR/nodes"/ENT-*.json "$CASE_DIR/nodes"/ENT-*.md; do
  [ -f "$node_file" ] || continue
  
  # 提取 ontology_ref.object_id（简化实现，实际应使用 yq/jq）
  ONT_ID=$(grep -oP 'object_id:\s*["'\'']?\K[^"'\''\s]+' "$node_file" 2>/dev/null || true)
  ONT_TYPE=$(grep -oP 'object_type:\s*["'\'']?\K[^"'\''\s,]+' "$node_file" 2>/dev/null || true)
  
  if [ -z "$ONT_ID" ]; then
    echo "⚠️  ERROR: $node_file 缺少 ontology_ref.object_id"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  # 检查本体文件是否存在
  ONT_DIR=""
  case "$ONT_TYPE" in
    Person) ONT_DIR="entities/person" ;;
    Organization) ONT_DIR="entities/organization" ;;
    Account) ONT_DIR="entities/account" ;;
    Evidence) ONT_DIR="entities/evidence" ;;
    Case) ONT_DIR="entities/case" ;;
    *) ONT_DIR="entities/unknown" ;;
  esac
  
  if [ ! -f "$ONT_DIR/$ONT_ID.yaml" ]; then
    echo "⚠️  ERROR: $node_file 引用本体 $ONT_DIR/$ONT_ID.yaml 不存在"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅  $node_file → $ONT_DIR/$ONT_ID.yaml (OK)"
  fi
done

# ---- 检查 2: EV 节点的 ontology_ref ----
echo ""
echo "--- 2. EV 节点 ontology_ref 检查 ---"
for node_file in "$CASE_DIR/nodes"/EV-*.json "$CASE_DIR/nodes"/EV-*.md; do
  [ -f "$node_file" ] || continue
  
  ONT_ID=$(grep -oP 'object_id:\s*["'\'']?\K[^"'\''\s]+' "$node_file" 2>/dev/null || true)
  
  if [ -z "$ONT_ID" ]; then
    echo "⚠️  ERROR: $node_file 缺少 ontology_ref.object_id"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  if [ ! -f "entities/evidence/$ONT_ID.yaml" ]; then
    echo "⚠️  ERROR: $node_file 引用 entities/evidence/$ONT_ID.yaml 不存在"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅  $node_file → entities/evidence/$ONT_ID.yaml (OK)"
  fi
done

# ---- 检查 3: Case 本体状态 ----
echo ""
echo "--- 3. Case 本体状态检查 ---"
META_STATUS=$(grep -oP '"status":\s*"\K[^"]+' "$CASE_DIR/meta.json" 2>/dev/null || echo "NOT_FOUND")
CASE_FILE="entities/case/case-$(echo "$CASE_ID" | tr '[:upper:'] '[:lower:]').yaml"
if [ -f "$CASE_FILE" ]; then
  ONT_STATUS=$(grep -oP 'lifecycle_status:\s*\K\S+' "$CASE_FILE" 2>/dev/null || echo "NOT_FOUND")
  echo "  认知层 status: $META_STATUS"
  echo "  本体层 lifecycle_status: $ONT_STATUS"
  # 注意：认知层的阶段状态（INIT/PRE/REVIEWING）不与本体层 lifecycle_status 直接映射
  # 此处仅做记录，不做校验
else
  echo "⚠️  ERROR: $CASE_FILE 不存在"
  ERRORS=$((ERRORS + 1))
fi

# ---- 汇总 ----
echo ""
echo "=== 巡检完成 ==="
if [ $ERRORS -eq 0 ]; then
  echo "✅  所有 Binding Protocol 检查通过"
  exit 0
else
  echo "❌  发现 $ERRORS 个偏移，请修复后重新运行"
  exit 1
fi