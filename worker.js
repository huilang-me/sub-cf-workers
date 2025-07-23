export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // === Step 1: 解析 UUID from path ===
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const uuid = pathSegments[0];

    // === Step 2: 环境变量数组 ===
    const proxyList = parseEnvList(env.PROXY_LIST);
    const subList = parseEnvList(env.SUB_LIST);
    const proxyIpList = parseEnvList(env.PROXYIP);
    const freeList = parseEnvList(env.FREE_LIST);

    // === Step 3: 校验 UUID ===
    if (!uuid || uuid !== env.UUID) {
      return new Response(await nginx(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    // === Step 4: 获取参数 ===
    const freeRaw = url.searchParams.get("free");
    const idRaw = url.searchParams.get("id");
    const subRaw = url.searchParams.get("sub");
    const proxyipRaw = url.searchParams.get("proxyip");

    // === Step 5: sub 参数处理 ===
    let sub = "";
    if (subRaw !== null && subRaw !== "") {
      const subIndex = parseInt(subRaw);
      if (!isNaN(subIndex) && subIndex >= 0 && subIndex < subList.length) {
        sub = subList[subIndex];
      } else {
        sub = subRaw;
      }
    }

    // === Step 6: proxyip 参数处理 ===
    let proxyip = "";
    if (proxyipRaw !== null && proxyipRaw !== "") {
      const proxyipIndex = parseInt(proxyipRaw);
      if (!isNaN(proxyipIndex) && proxyipIndex >= 0 && proxyipIndex < proxyIpList.length) {
        proxyip = proxyIpList[proxyipIndex];
      } else {
        proxyip = proxyipRaw;
      }
    }

    // === Step 7: FREE 模式跳转 ===
    if (freeRaw !== null) {
      const freeIndex = parseInt(freeRaw);
      if (isNaN(freeIndex) || freeIndex < 0 || freeIndex >= freeList.length) {
        return new Response("Invalid free index", { status: 400 });
      }

      const targetUrl = appendQueryParams(freeList[freeIndex], { sub, proxyip });
      return Response.redirect(targetUrl, 301);
    }

    // === Step 8: 获取代理 URL (id 必填) ===
    const id = parseInt(idRaw);
    if (isNaN(id) || id < 0 || id >= proxyList.length) {
      return new Response("Invalid id", { status: 400 });
    }

    
    const proxyUrl = proxyList[id];
    const targetUrl = appendQueryParams(proxyUrl, { sub, proxyip });
    return Response.redirect(targetUrl, 301);
  }
};

// 工具函数：将换行分割为数组
function parseEnvList(envVar) {
  return envVar.split("\n").map(line => line.trim()).filter(line => line !== "");
}

// 工具函数：拼接 URL 查询参数（顺序固定 sub -> proxyip）
function appendQueryParams(baseUrl, params) {
  const query = [];
  if (params.sub) query.push(`sub=${encodeURIComponent(params.sub)}`);
  if (params.proxyip) query.push(`proxyip=${encodeURIComponent(params.proxyip)}`);
  return query.length ? `${baseUrl}?${query.join("&")}` : baseUrl;
}

// 默认 nginx 页面
async function nginx() {
  return `
  <!doctype html>
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
              border-radius: 10px
          }
          ul {
              padding-left: 20px;
          }
          ul li {
              line-height: 2.3
          }
          a {
              color: #20a53a
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
  </html>
  `;
}
