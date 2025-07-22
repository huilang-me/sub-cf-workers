# Cloudflare Edgetunnel Subscription Proxy

这是一个基于 **Cloudflare Workers** 构建的轻量级订阅管理系统，支持根据 `uuid` 和 `id` 参数动态拉取代理链接，并根据用户参数选择优选订阅模板。适用于 Shadowrocket、V2RayN 等客户端。
原理：根据参数选择对应的订阅地址，根据第三方优选订阅，传入临时参数，然后替换后改成自己的，达到隐藏真实订阅地址的目的
最终用途：方便管理多个订阅，以及优选

## 🌐 特性

- ✅ 使用 URL 参数动态校验 `uuid`，增强访问控制
- ✅ 支持多个代理订阅地址（通过环境变量管理）
- ✅ 可选 "优选订阅" 模板（替换其中的 `tmpUuid` / `tmpHost`）
- ✅ 自动返回 Shadowrocket 等客户端所需的 `Subscription-Userinfo` header
- ✅ 未授权访问时显示自定义 Nginx 成功页面

## 环境变量说明

- UUID：用于入口保护，不限制内容，防止泄露
- PROXY_LIST: 你的edgetunnel workers链接，参考 https://github.com/cmliu/edgetunnel ，每行一个
  ```
    https://xxx1.xxx.workers.dev/xxx-xxx-xxx-xxx-xxx
    https://xxx2.xxx.workers.dev/xxx-xxx-xxx-xxx-xxx
  ```
- SUB_LIST：优选订阅的路径，每行一个
  ```
    https://sub.cmliussss.net/sub?uuid=tmpUuid&encryption=none&security=&sni=tmpHost&fp=randomized&type=ws&host=tmpHost&path=%2F%3Fed%3D2560&allowInsecure=1&fragment=1,40-60,30-50,tlshello
    https://owo.o00o.ooo/sub?uuid=tmpUuid&encryption=none&security=tls&sni=tmpHost&alpn=h3&fp=random&type=ws&host=tmpHost&path=%2F%3Fed%3D2560&allowInsecure=1&fragment=1,40-60,30-50,tlshello
  ```

## 访问链接参数

- uuid: 上面的UUID变量（必填）
- id：调用的PROXY_LIST的INDEX（必填）
- sub：SUB_LIST的内容，0不走优选订阅，1选择第一个优选，2选择第二个优选，依次类推，默认0（非必填）

---

## 🚀 快速开始（Cloudflare Workers）

通过 Cloudflare 官方后台界面部署本项目

### 🧭 步骤如下：

1. 登录你的 Cloudflare 账号：https://dash.cloudflare.com  
2. 在左侧菜单中点击 **「计算 (Workers)」**，然后选择 **「Workers & Pages」**  
3. 进入「概览」页面后，点击右上角的 **「创建应用」**  
4. 选择 **「Start from a template → Hello World」**，点击 **「开始使用」**  
5. 为你的 Worker 取一个唯一的名称，例如：`sub`  
6. 点击 **「部署」**  
7. 部署完成后，点击右上角的 **「编辑代码」**，进入在线代码编辑器  
8. 删除默认的全部代码  
9. 打开本仓库中的 `worker.js` 文件，复制其所有内容  
10. 将复制的代码粘贴到 Cloudflare Worker 编辑器中  
11. 点击编辑器右上角的 **「保存并部署」** 按钮
12. 添加环境变量 `UUID`， `PROXY_LIST`， `SUB_LIST`
14. 现在你就可以访问你的 Worker 链接 如 https://xxx.xxx.workers.dev/uuid=34fbb9eb-5d6b-4d33-8f2b-d2624d048b04&id=0&sub=1
