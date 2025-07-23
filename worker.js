export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const uuid = pathSegments[0];

    // UUID 校验：必须存在且匹配
    if (!uuid || uuid !== env.UUID) {
      const isRoot = pathSegments.length === 0;
      if (isRoot) {
        return new Response(await nginx(), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } else {
        return new Response(await nginx404(), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    // 处理 /$UUID/admin 路由，显示和提交 KV 管理后台
    if (pathSegments.length === 2 && pathSegments[1] === "admin") {
      if (request.method === "POST") {
        try {
          const formData = await request.formData();
          await Promise.all([
            env.KV.put("proxy_list", formData.get("proxy_list") || ""),
            env.KV.put("sub_list", formData.get("sub_list") || ""),
            env.KV.put("proxyip_list", formData.get("proxyip_list") || ""),
            env.KV.put("free_list", formData.get("free_list") || ""),
          ]);
          return new Response(`保存成功`, { status: 200 });
        } catch (e) {
          return new Response(`写入失败: ${e.message}`, { status: 500 });
        }
      }
      

      const [proxy_list, sub_list, proxyip_list, free_list] = await Promise.all([
        env.KV.get("proxy_list") || "",
        env.KV.get("sub_list") || "",
        env.KV.get("proxyip_list") || "",
        env.KV.get("free_list") || "",
      ]);

      return new Response(renderAdminForm({ proxy_list, sub_list, proxyip_list, free_list }), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 正常业务逻辑 - 读取 KV 配置
    const freeRaw = url.searchParams.get("free");
    const idRaw = url.searchParams.get("id");
    const subRaw = url.searchParams.get("sub");
    const proxyipRaw = url.searchParams.get("proxyip");

    const [proxyListStr, subListStr, proxyIpListStr, freeListStr] = await Promise.all([
      env.KV.get("proxy_list"),
      env.KV.get("sub_list"),
      env.KV.get("proxyip_list"),
      env.KV.get("free_list"),
    ]);

    const proxyList = parseEnvList(proxyListStr);
    const subList = parseEnvList(subListStr);
    const proxyIpList = parseEnvList(proxyIpListStr);
    const freeList = parseEnvList(freeListStr);

    // sub 参数处理
    let sub = "";
    if (subRaw !== null && subRaw !== "") {
      const subIndex = parseInt(subRaw);
      if (!isNaN(subIndex) && subIndex >= 0 && subIndex < subList.length) {
        sub = subList[subIndex];
      } else {
        sub = subRaw;
      }
    }

    // proxyip 参数处理
    let proxyip = "";
    if (proxyipRaw !== null && proxyipRaw !== "") {
      const proxyipIndex = parseInt(proxyipRaw);
      if (!isNaN(proxyipIndex) && proxyipIndex >= 0 && proxyipIndex < proxyIpList.length) {
        proxyip = proxyIpList[proxyipIndex];
      } else {
        proxyip = proxyipRaw;
      }
    }

    // free 模式跳转
    if (freeRaw !== null) {
      const freeIndex = parseInt(freeRaw);
      if (isNaN(freeIndex) || freeIndex < 0 || freeIndex >= freeList.length) {
        return new Response("Invalid free index", { status: 400 });
      }
      const targetUrl = appendQueryParams(freeList[freeIndex], { sub, proxyip });
      try {
        return Response.redirect(targetUrl, 302);
      } catch (e) {
        return new Response(`跳转失败，请检查free_list格式: ${e.message}`, { status: 500 });
      }
    }

    // id 参数校验及跳转
    const id = parseInt(idRaw);
    if (isNaN(id) || id < 0 || id >= proxyList.length) {
      return new Response("Invalid id", { status: 400 });
    }

    const proxyUrl = proxyList[id];
    const targetUrl = appendQueryParams(proxyUrl, { sub, proxyip });
    try {
      return Response.redirect(targetUrl, 302);
    } catch (e) {
      return new Response(`跳转失败，请检查proxy_list格式: ${e.message}`, { status: 500 });
    }
  }
};

// 工具函数：将换行字符串拆分成数组
function parseEnvList(str) {
  if (!str) return [];
  return str.split("\n").map(line => line.trim()).filter(line => line !== "");
}

// 工具函数：拼接 URL 查询参数（sub -> proxyip 顺序）
function appendQueryParams(baseUrl, params) {
  const query = [];
  if (params.sub) query.push(`sub=${encodeURIComponent(params.sub)}`);
  if (params.proxyip) query.push(`proxyip=${encodeURIComponent(params.proxyip)}`);
  return query.length ? `${baseUrl}?${query.join("&")}` : baseUrl;
}

// 管理后台页面渲染函数
function renderAdminForm(data) {
  const escape = (str) => (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>KV 数据管理面板</title>
  <style>
    body { font-family: sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; }
    textarea { width: 100%; height: 120px; font-family: monospace; margin-bottom: 16px; }
    label { font-weight: bold; display: block; margin-top: 20px; }
    button { padding: 8px 16px; background-color: #007bff; color: white; border: none; cursor: pointer; border-radius: 4px; }
    button:hover { background-color: #0056b3; }
    .tip { font-size: 0.9em; color: gray; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>KV 数据管理面板</h1>
  <form method="POST">
    <label>proxy_list</label>
    <div class="tip">每行一个Workers订阅 URL</div>
    <textarea name="proxy_list" placeholder="https://xx.example.workers.dev/xxxxx-xxxx-xxxx-xxxx-xxxxxx\nhttps://example.com/proxy2">${escape(data.proxy_list)}</textarea>

    <label>sub_list</label>
    <div class="tip">每行一个 sub 参数值</div>
    <textarea name="sub_list" placeholder="sub.cmliussss.net\nsub2">${escape(data.sub_list)}</textarea>

    <label>proxyip_list</label>
    <div class="tip">每行一个 proxyip 参数值</div>
    <textarea name="proxyip_list" placeholder="ProxyIP.US.CMLiussss.net\nproxyip2">${escape(data.proxyip_list)}</textarea>

    <label>free_list</label>
    <div class="tip">每行一个免费订阅 URL</div>
    <textarea name="free_list" placeholder="https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2\nhttps://example.com/free2">${escape(data.free_list)}</textarea>

    <button type="submit">保存修改</button>
  </form>
</body>
</html>`;
}

// 默认 nginx 页面
async function nginx() {
  return `<!doctype html>
  <html>
  <head>
      <meta charset="utf-8">
      <title>恭喜，站点创建成功！</title>
      <style>
          .container {
              width: 60%;
              margin: 10% auto 0;
              background-color: #f0f0f0;
              padding: 2% 5%;
              border-radius: 10px;
          }
          ul {
              padding-left: 20px;
          }
          ul li {
              line-height: 2.3;
          }
          a {
              color: #20a53a;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <h1>恭喜, 站点创建成功！</h1>
          <h3>这是默认index.html，本页面由系统自动生成</h3>
          <ul>
              <li>本页面在FTP根目录下的index.html</li>
              <li>您可以修改、删除或覆盖本页面</li>
              <li>FTP相关信息，请到“面板系统后台 > FTP” 查看</li>
          </ul>
      </div>
  </body>
  </html>`;
}

async function nginx404() {
  return `<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx</center>
</body>
</html>`;
}
