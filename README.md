# Cloudflare Edgetunnel Subscription Proxy (Enhanced Version)

这是一个基于 **Cloudflare Workers** 的轻量级订阅跳转系统，旨在隐藏真实订阅地址，统一管理多个代理节点，支持 Shadowrocket / V2RayN 等客户端访问。

> 原理：通过参数动态拼接代理地址或免费订阅地址，实现分流、优选、自定义域名绑定等功能，防止真实源泄露。

## 🌐 功能特性

* ✅ 使用 URL Path 中的 `uuid` 作为入口校验，防止泄露
* ✅ 支持多个代理地址（`PROXY_LIST`）自动选择跳转
* ✅ 支持优选订阅模板和PROXYIP（`SUB_LIST` + `PROXYIP`）
* ✅ 可指定免费订阅地址并强制跳转（`FREE_LIST`）
* ✅ 最终直接301跳转，无网页请求
* ✅ 未授权访问返回仿建站成功页

## 🛠 环境变量说明

* `UUID`：入口保护，必须匹配路径
* `PROXY_LIST`：代理节点跳转地址（每行一个）

  ```
  https://xxx1.xxx.workers.dev/xxx-xxx-xxx
  https://xxx2.xxx.workers.dev/xxx-xxx-xxx
  ```
* `SUB_LIST`：优选订阅模板（每行一个），可用于拼接 sub 参数

  ```
  sub.cmliussss.net
  owo.o00o.ooo
  ```
* `PROXYIP`：节点绑定的 proxyip 域名（每行一个）

  ```
  ProxyIP.US.CMLiussss.net
  proxyip.tp27231.hbmc.net
  kr.tp50000.netlib.re
  tw.tp81.netlib.re
  ```
* `FREE_LIST`：免费订阅地址（每行一个）

  ```
  https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2
  ```

## 📌 链接参数说明

访问示例：

```
https://your-worker.workers.dev/{uuid}?id=0&sub=1&proxyip=2
```

### 参数含义：

| 参数        | 说明                                                 |
| --------- | -------------------------------------------------- |
| `uuid`    | URL Path 中的 UUID，用于入口验证（必填）                        |
| `id`      | 对应 `PROXY_LIST` 的索引，用于选择跳转目标                   |
| `sub`     | 选择 `SUB_LIST` 的模板索引（如为字符串则原样使用）                    |
| `proxyip` | 选择 `PROXYIP` 的索引（或使用自定义字符串）                        |
| `free`    | 选择 `FREE_LIST` 中的免费订阅地址索引（如果设置，**直接跳转该地址**，忽略其他参数） |

✅ free和id二选一必填

✅ `free` 模式下也会附带 `sub` / `proxyip` 参数（若存在），以支持模板注入

## 🚀 快速部署指南（适用于 Cloudflare Workers）

1. 登录 Cloudflare 管理后台：[https://dash.cloudflare.com](https://dash.cloudflare.com)
2. 选择左侧菜单「Workers & Pages」 > 「创建应用」
3. 使用模板 "Hello World" 创建项目
4. 点击「部署」后进入编辑器
5. 清空默认代码，将本仓库中的 `worker.js` 内容粘贴进去
6. 点击「保存并部署」
7. 配置以下环境变量：

   * `UUID`
   * `PROXY_LIST`
   * `SUB_LIST`
   * `PROXYIP`
   * `FREE_LIST`
9. 完成后即可访问：

   ```
   https://your-subdomain.workers.dev/{UUID}?id=0&sub=1&proxyip=0
   ```

## 📣 示例用法

### 🎯 普通跳转：

```
https://xxx.workers.dev/your-uuid?id=0&sub=1&proxyip=2
→ 301 跳转至 PROXY_LIST[0]?sub=...&proxyip=...
```

### 🎯 Free 模式：

```
https://xxx.workers.dev/your-uuid?free=0&sub=sub.abc.com&proxyip=proxy.def.net
→ 301 跳转至 FREE_LIST[0]?sub=sub.abc.com&proxyip=proxy.def.net
```

## 🧱 感谢项目

* [edgetunnel](https://github.com/cmliu/edgetunnel)
