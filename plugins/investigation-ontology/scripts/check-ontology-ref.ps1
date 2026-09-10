# ============================================================================
# check-ontology-ref.ps1 — PostToolUse Hook (PowerShell)
#
# Windows 备选版本。功能与 check-ontology-ref.sh 完全一致。
# ============================================================================

$ErrorActionPreference = "Stop"

$raw = [Console]::In.ReadToEnd()
try { $hookInput = $raw | ConvertFrom-Json } catch { exit 0 }

# 提取 file_path（兼容 CodeBuddy 的 filePath 和 Claude Code 的 file_path）
$filePath = $hookInput.tool_input.file_path
if (-not $filePath) { $filePath = $hookInput.tool_input.filePath }
if (-not $filePath) { $filePath = $hookInput.tool_input.path }
$cwd = $hookInput.cwd

# ── 路径匹配：只检查 ENT 和 EV 节点 ──────────────────────────────
if ($filePath -notmatch '(^|\\|/)nodes[/\\](ENT-|EV-)') {
    exit 0
}

# ── 构建绝对路径 ──────────────────────────────────────────────────
if ([System.IO.Path]::IsPathRooted($filePath)) {
    $absPath = $filePath
} else {
    $absPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($cwd, $filePath))
}

if (-not (Test-Path $absPath)) { exit 0 }

# ── 检查 ontology_ref ──────────────────────────────────────────────
$content = Get-Content $absPath -Raw

if ($content -notmatch 'ontology_ref') {
    $msg = @{
        hookSpecificOutput = @{
            hookEventName = "PostToolUse"
            additionalContext = "⚠️ [Binding Protocol] 文件 $filePath 缺少 ontology_ref 字段。请立即补充指向 global_ontology/entities/ 中对应本体对象的引用。详见 skills/ontology/references/binding-protocol.md。"
        }
    } | ConvertTo-Json -Compress
    Write-Output $msg
    exit 0
}

# 提取 object_id 并检查指向有效性
if ($content -match '"object_id"\s*:\s*"([^"]+)"') {
    $objectId = $matches[1]
    if ($content -match '"object_type"\s*:\s*"([^"]+)"') {
        $objectType = $matches[1]
        $typeMap = @{
            "Person" = "global_ontology/entities/person"
            "Organization" = "global_ontology/entities/organization"
            "Account" = "global_ontology/entities/account"
            "Evidence" = "global_ontology/entities/evidence"
            "Case" = "global_ontology/entities/case"
        }
        if ($typeMap.ContainsKey($objectType)) {
            # 向上查找项目根目录
            $projRoot = $cwd
            if ($filePath -match '^(.+?)/cases/') {
                $projRoot = $matches[1]
            }
            $targetPath = Join-Path $projRoot "$($typeMap[$objectType])/${objectId}.yaml"
            if (-not (Test-Path $targetPath)) {
                $msg = @{
                    hookSpecificOutput = @{
                        hookEventName = "PostToolUse"
                        additionalContext = "⚠️ [Binding Protocol] $filePath 中 ontology_ref.object_id='$objectId' 指向的文件不存在于 $($typeMap[$objectType])/。请确认本体层已创建对应对象，或修正 object_id。"
                    }
                } | ConvertTo-Json -Compress
                Write-Output $msg
            }
        }
    }
}

exit 0