# Cloudflare Pages 订阅管理系统 (安全增强版)

这是一个基于 **Cloudflare Pages + KV 存储** 的高性能、私密订阅跳转系统。它通过 Web Crypto API 实现了安全的管理后台，支持动态参数拼接与公开优选接口。

## 🚀 在线演示 (Demo)

* **演示地址**: [https://sub-cf-workers-1ct.pages.dev/](https://sub-cf-workers-1ct.pages.dev)
* **测试凭据**: 用户名 `demo` / 密码 `demo`

---

## 🔧 环境变量与绑定

在部署后的 Cloudflare 控制台，请配置以下内容：

### 1. 环境变量 (Variables)

| 变量名 | 必填 | 描述 |
| --- | --- | --- |
| `UUID` | 是 | 访问密钥（路径凭证） |
| `AUTH_USERNAME` | 是 | 管理后台用户名 |
| `AUTH_PASSWORD` | 是 | 管理后台密码 |
| `PROXY_LIST` | 否 | 静态跳转列表（只读，环境变量配置） |
| `TURNSTILE_SITE_KEY` | 否 | Turnstile 站点密钥 (Site Key) |
| `TURNSTILE_SECRET_KEY` | 否 | Turnstile 通信密钥 (Secret Key) |

### 2. KV 命名空间绑定

* **变量名称**：`KV`
* **存储内容**：`proxy_list` (动态), `sub_list`, `proxyip_list`, `free_list`, `add`。

---

## 🛡️ 如何获取 Turnstile 密钥 (可选但强烈建议)

为了防止管理后台被暴力破解，建议开启 Cloudflare 免费的人机验证：

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 在左侧菜单栏点击 **Turnstile**。
3. 点击 **Add Site**：
* **Site Name**: 随便填写（如：MySubManager）。
* **Domain**: 填写你的 Pages 或 Workers 域名（例如 `xxx.pages.dev`）。
* **Widget Type**: 选择 **Managed** (推荐)。


4. 创建完成后，你会获得：
* **Site Key**: 填入环境变量 `TURNSTILE_SITE_KEY`。
* **Secret Key**: 填入环境变量 `TURNSTILE_SECRET_KEY`。


5. **重新部署** Worker/Pages 即可生效。

---

## 🧠 路由说明

### 🎯 订阅跳转：`GET /{UUID}?params`

跳转地址逻辑：`域名/${UUID}?id=索引&sub=索引&proxyip=索引`

* `id`: 对应 `PROXY_LIST` (环境变量+KV) 的索引。
* `free`: 对应 `free_list` 的索引（启用后忽略 `id`）。
* `sub` / `proxyip`: 匹配列表中的值或使用自定义字符串。

### 🎯 公开接口：`GET /add.txt`

* 直接返回 KV 中 `add` 键的内容，方便优选 IP 脚本调用。

---

## 🛠 部署指南

1. **Fork 本项目**。
2. 在 Cloudflare Pages 仪表板点击 **Connect to Git**，选中项目。
3. 在部署设置中添加环境变量，并完成 **KV 绑定**（名称必须为 `KV`）。
4. **注意**：在 Pages 绑定 KV 时，请确保在“生产”和“预览”环境都进行了绑定。
5. 点击部署。访问 `https://your-app.pages.dev/{UUID}` 即可看到管理面板。

---

## ⚠️ 免责声明

* 本项目仅供**教育、研究与安全测试**目的。
* 系统仅作为跳转中转，不存储任何实际代理节点内容。
* 请妥善保管您的 `UUID` 与管理密码，因配置泄露导致的后果由使用者自行承担。
