# ============================================================================
# validate-ontology-action.ps1 — PreToolUse Hook (PowerShell)
#
# Windows 备选版本。当 Git Bash 不可用时，hooks.json 可配置此脚本。
# 功能与 validate-ontology-action.sh 完全一致。
# ============================================================================

$ErrorActionPreference = "Stop"

# ── 读取 stdin JSON ────────────────────────────────────────────────
$raw = [Console]::In.ReadToEnd()
try { $hookInput = $raw | ConvertFrom-Json } catch { exit 0 }

$filePath = $hookInput.tool_input.file_path
$toolName = $hookInput.tool_name
$cwd = $hookInput.cwd

# 提取 payload（Write: content, Edit: new_string）
if ($hookInput.tool_input.PSObject.Properties.Name -contains "content") {
    $payload = $hookInput.tool_input.content
} elseif ($hookInput.tool_input.PSObject.Properties.Name -contains "new_string") {
    $payload = $hookInput.tool_input.new_string
} else {
    $payload = ""
}

# ── 路径匹配：只处理 global_ontology/entities/ 和 global_ontology/relations/ ──
if ($filePath -notmatch '(^|\\|/)global_ontology[/\\]entities[/\\]' -and $filePath -notmatch '(^|\\|/)global_ontology[/\\]relations[/\\]') {
    exit 0
}

# ── 构建绝对路径 ──────────────────────────────────────────────────
if ([System.IO.Path]::IsPathRooted($filePath)) {
    $absPath = $filePath
} else {
    $absPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($cwd, $filePath))
}

# ── 辅助函数 ──────────────────────────────────────────────────────
function Deny {
    param([string]$reason)
    $escaped = $reason -replace '"','\"' -replace "`n","\\n"
    $output = @{
        hookSpecificOutput = @{
            hookEventName = "PreToolUse"
            permissionDecision = "deny"
            permissionDecisionReason = $escaped
        }
    } | ConvertTo-Json -Compress
    Write-Output $output
    exit 0
}

function YamlField {
    param([string]$file, [string]$key)
    if (-not (Test-Path $file)) { return "" }
    $line = Get-Content $file | Select-String -Pattern "^\s*${key}\s*:" | Select-Object -First 1
    if (-not $line) { return "" }
    ($line.Line -replace ".*${key}\s*:\s*", "" -replace '"','' -replace "'",'').Trim()
}

# ── Action 反查 ────────────────────────────────────────────────────

# CLOSE_CASE: global_ontology/entities/case/*.yaml + lifecycle_status: CLOSED
if ($filePath -match 'global_ontology[/\\]entities[/\\]case[/\\]') {
    if ($payload -match 'lifecycle_status\s*:\s*CLOSED') {
        # 1. 检查当前状态
        $curStatus = YamlField $absPath "lifecycle_status"
        if ($curStatus -and $curStatus -ne "ACTIVE") {
            Deny "[CLOSE_CASE] 案件当前 lifecycle_status 为 '$curStatus'，不是 ACTIVE。"
        }
        # 2. 检查涉及实体
        if (Test-Path $absPath) {
            $entityDir = Join-Path (Split-Path $absPath -Parent) "..\..\entities" -Resolve -ErrorAction SilentlyContinue
            if ($entityDir) {
                $content = Get-Content $absPath -Raw
                if ($content -match 'involved_entities:\s*\n((?:\s*-\s*\S+\n?)+)') {
                    $ids = $matches[1] -split '\s*-\s*' | Where-Object { $_ -match '\S' } | ForEach-Object { $_.Trim() -replace '"','' }
                    foreach ($id in $ids) {
                        $ef = Get-ChildItem $entityDir -Recurse -Filter "${id}.yaml" | Select-Object -First 1
                        if ($ef) {
                            $es = YamlField $ef.FullName "lifecycle_status"
                            if ($es -eq "UNRESOLVED") {
                                Deny "[CLOSE_CASE] Entity '$id' 为 UNRESOLVED。请先执行 RESOLVE_ENTITY。"
                            }
                        }
                    }
                }
            }
        }
    }
    exit 0
}

# ASSERT_RELATION: global_ontology/relations/*.yaml
if ($filePath -match 'global_ontology[/\\]relations[/\\]') {
    if (-not (Test-Path $absPath) -or (Get-Item $absPath).Length -eq 0) {
        # 新建关系
        if (-not ($payload -match 'source_evidence_refs')) {
            Deny "[ASSERT_RELATION] 缺少 source_evidence_refs。"
        }
    }
    exit 0
}

# RESOLVE_ENTITY: global_ontology/entities/(person|organization|account)/*.yaml + VERIFIED
if ($filePath -match 'global_ontology[/\\]entities[/\\](person|organization|account)[/\\]') {
    if ($payload -match 'lifecycle_status\s*:\s*VERIFIED') {
        $curStatus = YamlField $absPath "lifecycle_status"
        if ($curStatus -and $curStatus -ne "UNRESOLVED") {
            Deny "[RESOLVE_ENTITY] 实体当前 lifecycle_status 为 '$curStatus'，不是 UNRESOLVED。"
        }
    }
    exit 0
}

# SEAL_EVIDENCE: global_ontology/entities/evidence/*.yaml + sealed: true
if ($filePath -match 'global_ontology[/\\]entities[/\\]evidence[/\\]') {
    if ($payload -match 'sealed\s*:\s*true') {
        $curSealed = YamlField $absPath "sealed"
        if ($curSealed -eq "true") {
            Deny "[SEAL_EVIDENCE] 证据已处于 sealed 状态，不能重复冻结。"
        }
    }
    exit 0
}

exit 0