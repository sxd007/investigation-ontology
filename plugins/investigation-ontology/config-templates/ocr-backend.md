<!--
⚠️ 模板文件 — 插件发版携带，每次插件更新时覆盖。

实际用户配置写入路径（升级不受影响）：
  {PLUGIN_CONFIG_DIR}/ocr-backend.md

此文件仅供 cold-start 作为模板读取和填充。document-parsing 技能从用户配置路径读取。
每次发版更新此模板时，需要保留所有 [PLACEHOLDER] 标记。
-->

# OCR 后端配置

*由 /efio:cold-start 生成。插件更新不覆盖此文件。修改后立即生效。*

*此文件配置 paddleOCR-mcp 如何接收待解析的文档文件。MCP 端点注册在各平台的 MCP 配置文件中，本文件仅配置文档投递机制。*

---

## paddleOCR-mcp 文档投递

**影响技能：** document-parsing（OCR 路径的文件上传步骤）

### 上传方式

<!-- 选择一种上传方式，删除或注释掉不需要的。 -->
<!-- cold-start 根据用户部署情况填写，默认 auto。 -->

**Upload Method:** [PLACEHOLDER: auto / http / shared_fs / custom]

#### auto — 自动推导（标准部署）

> 适用于按部署规范部署的 PaddleOCR MCP（MCP 端点与上传接口在同一主机，端口+1）。

从 MCP 配置中的 `url` 字段自动推导上传地址：同主机、端口号+1、路径改为 `/upload`。

- `http://localhost:8090/mcp` → `http://localhost:8091/upload`
- `http://10.0.0.1:8090/mcp` → `http://10.0.0.1:8091/upload`

#### http — 显式指定上传地址

> 适用于非标部署（如反向代理、不同主机、云服务）。

**Upload Endpoint:** [PLACEHOLDER: http://your-ocr-server:port/upload]

#### shared_fs — 共享文件系统

> 适用于 OCR 服务器与客户端共享文件系统的场景（如 NFS、SMB 挂载，两端挂载同一共享目录）。文件已在共享路径中，无需上传。

**Shared Path Prefix:** [PLACEHOLDER: /mnt/shared/ocr_uploads/]

文件基本名（basename，不含目录路径）拼接前缀得到服务器侧路径。例：客户端文件 `D:\cases\raw\ev-010.jpg`，前缀 `/mnt/shared/ocr_uploads/` → 服务器路径 `/mnt/shared/ocr_uploads/ev-010.jpg`。

#### custom — 自定义投递方式

> 适用于上述方式均不适用的情况。在下方描述具体的投递步骤。

**Custom Upload Instructions:** [PLACEHOLDER: 描述文件投递到 OCR 服务器的具体步骤]

---

### 认证（可选）

> 如果上传接口需要认证（如 API Key、Bearer Token），在此配置。
> 留空则上传请求不携带认证头。

**Auth Headers:** [PLACEHOLDER: none / Authorization: Bearer your-token-here]

---

### 响应格式（可选）

> HTTP 上传响应中，服务器侧文件路径（localpath）所在的 JSON 字段名。
> 默认为 `path`。如果服务器返回格式不同，在此指定。

**Localpath Field:** [PLACEHOLDER: path]

---

## 配置示例

### 示例 A：标准部署（端口+1约定，无认证）

```yaml
Upload Method: auto
Auth Headers: none
Localpath Field: path
```

### 示例 B：云服务（显式地址 + API Key）

```yaml
Upload Method: http
Upload Endpoint: https://ocr.company.com/api/upload
Auth Headers: Authorization: Bearer sk-xxxxxxxx
Localpath Field: data.filepath
```

### 示例 C：共享文件系统

```yaml
Upload Method: shared_fs
Shared Path Prefix: /mnt/nas/ocr_uploads/
Auth Headers: none
```

---

*编辑此文件即可更新 OCR 后端配置。改一处，document-parsing 技能下次解析即生效。*
