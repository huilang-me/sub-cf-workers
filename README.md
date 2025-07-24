# Cloudflare Workers 订阅管理器

这是一个基于 **Cloudflare Workers + KV 存储** 的轻量级订阅跳转系统，旨在：

* 管理多个订阅地址
* 支持动态跳转多种代理节点
* 提供免费订阅整合方案
* 并通过 `/admin` 页面实现 **在线管理所有跳转源**

> ⚠️ 所有请求均需携带合法 UUID，非法访问返回伪装页或 404，防止爬虫探测和滥用。

---

## ✨ 功能特性

* ✅ 使用 URL Path 中的 `uuid` 作为唯一访问凭证，未命中返回默认站点或 404
* ✅ 自动读取 KV 存储中的订阅信息，实现灵活配置
* ✅ 支持通过 Web 表单管理所有订阅地址（/uuid/admin）
* ✅ 支持免费订阅一键跳转（`free_list`）
* ✅ 支持高级组合参数：`sub`（优选模板）+ `proxyip`（IP绑定）
* ✅ 所有跳转均为 302 重定向，客户端透明处理
* ✅ 完整支持 Shadowrocket、V2RayN 等客户端

---

## 🔧 KV 键说明（部署后通过 Web 管理）

| KV Key         | 描述                  |
| -------------- | ------------------- |
| `proxy_list`   | 路由跳转目标列表，每行为一个 URL  |
| `sub_list`     | 可选订阅模板（用于 `sub` 参数） |
| `proxyip_list` | 可选绑定的 IP 或子域名       |
| `free_list`    | 免费订阅源跳转目标           |

可通过 Web 表单 `/your-uuid/admin` 编辑这些内容。

---

## 🧠 路由说明

### `GET /{uuid}`

* 校验 UUID，匹配则继续处理请求，未匹配返回默认站点或 `404`
* 支持以下 GET 参数：

| 参数        | 说明                                           |
| --------- | -------------------------------------------- |
| `id`      | `proxy_list` 中的跳转目标索引（必填，或使用 `free` 替代）      |
| `sub`     | 订阅模板索引或字符串，附加为 `?sub=` 参数                    |
| `proxyip` | IP 模板索引或字符串，附加为 `?proxyip=` 参数               |
| `free`    | 启用免费订阅跳转（索引），此时忽略 `id`，跳转到 `free_list[n]` 地址 |

### `GET /{uuid}/admin`

> 管理面板（需 UUID 匹配）

* 显示并编辑 KV 中的四个列表
* 修改后提交自动写入 KV

---

## 🧪 示例用法

### 🎯 普通跳转

```
https://your-worker.workers.dev/{uuid}?id=0&sub=1&proxyip=2
→ 跳转至 proxy_list[0]?sub=sub_list[1]&proxyip=proxyip_list[2]
```

或使用自定义值：

```
https://your-worker.workers.dev/{uuid}?id=1&sub=custom.sub.net&proxyip=ip.custom.net
```

### 🎯 Free 模式（忽略 id 参数）

```
https://your-worker.workers.dev/{uuid}?free=0&sub=sub.example.com&proxyip=ip.example.com
→ 跳转至 free_list[0]?sub=...&proxyip=...
```

---

## 🔐 入口验证机制

| 路径                     | 行为                    |
| ---------------------- | --------------------- |
| `/`                    | 返回伪装的建站成功页面           |
| `/invalid`             | 返回自定义 nginx 样式 404 页面 |
| `/your-valid-uuid/...` | 继续执行逻辑跳转              |

---

## 🛠 部署指南（Cloudflare Workers）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)

2. 进入「Workers & Pages」> 创建应用

3. 使用模板「Hello World」创建 Worker

4. 将仓库中的代码复制粘贴替换默认代码

5. 在左侧配置面板中添加以下环境变量：

   * `UUID`：你的访问密钥（必须为 URL-safe 字符串）
   * `PROXY_LIST`: 代理地址，这里写入的话不会被前端修改

6. 添加 KV 命名空间，并绑定为 `KV`（用于保存 proxy/sub 等列表）

7. 点击部署，访问路径如下：

```
https://your-worker.workers.dev/{UUID}/admin
https://your-worker.workers.dev/{UUID}?id=0&sub=1&proxyip=1
https://your-worker.workers.dev/{UUID}?free=0
```

---

## 📦 示例 KV 内容格式

每行一个：

### proxy\_list:

```
https://sub1.example.workers.dev/xxx-xxx-xxx
https://sub2.example.workers.dev/yyy-yyy-yyy
```

### sub\_list:

```
sub.cmliussss.net
owo.o00o.ooo
```

### proxyip\_list:

```
ProxyIP.US.CMLiussss.net
proxyip.example2.net
```

### free\_list:

```
https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2
https://mirror.host.com/free
```

---

## 🔧 在线管理（强烈推荐）

访问以下路径可在线配置所有订阅内容：

```
https://your-worker.workers.dev/{uuid}/admin
```

---

## ⚠️ 免责声明

> 本项目仅供**教育、研究与安全测试**目的而设计和开发。
> 所有跳转行为均为用户自主配置，系统本身不存储任何实际订阅内容，仅作为中转跳转用途。
> 所有数据存储于 Cloudflare KV，**请妥善保管您的 UUID 与订阅数据**，如发生数据丢失、泄露等情况，开发者概不负责。
> 请勿将本项目用于任何非法用途，使用者需自行承担相关责任。

---

## ❤️ 鸣谢与参考

* [edgetunnel](https://github.com/cmliu/edgetunnel)
* [Cloudflare Workers](https://developers.cloudflare.com/workers/)

---
