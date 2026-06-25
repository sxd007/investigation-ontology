# 本体实体模板：Account（金融账户）

## 文件路径
`entities/account/{id}.yaml`

```yaml
meta:
  id: "acc-{NNNN}"
  type: Account
  lifecycle_status: UNRESOLVED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "system"
  source_evidence_ref: "ev-010"

properties:
  account_no_hash: "sha256:..."  # 账号 SHA256（脱敏）
  account_label: "张三 尾号8891"
  bank_name: "XX银行"
  account_type: "personal"       # personal | corporate | virtual

links:
  owner: "P-0001"                # 指向 entities/person/ 或 entities/organization/
  transactions:                   # 指向 relations/ 中的资金转移关系
    - "R-001"
    - "R-002"
```