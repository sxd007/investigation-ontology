# Action: DISPUTE_ENTITY

> 标记实体为争议状态，触发复核流程。**本文件被 CLAUDE.md 引用。**

---

## □ 前置条件检查清单
- `lifecycle_status` 是否为 VERIFIED？是 / 否
- ❌ 如果否：终止操作
- 是否有矛盾证据支持争议？是 / 否
- ❌ 如果否：终止操作

## 执行步骤
1. 更新 `lifecycle_status: DISPUTED`
2. 记录争议原因和矛盾证据引用
3. 通知认知层触发复核流程
4. 记录审计