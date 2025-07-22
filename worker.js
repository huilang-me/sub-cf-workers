export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 验证 uuid
    const allowedUuid = env.UUID;
    const uuid = url.searchParams.get("uuid");
    if (!uuid || uuid !== allowedUuid) {
      return new Response(await nginx(), {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=UTF-8',
        }
      });
    }

    // 读取代理列表
    const proxyList = (env.PROXY_LIST || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    const id = parseInt(url.searchParams.get("id") || "-1");
    if (isNaN(id) || id < 0 || id >= proxyList.length) {
      return new Response(await nginx(), {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=UTF-8',
        }
      });
    }

    let targetUrl = proxyList[id];
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    const uuidValue = parsed.pathname.replace(/^\//, "");
    
    
    // 处理 proxyip 参数
    const proxyIpParam = url.searchParams.get("proxyip");
    if (proxyIpParam) {
      const proxyIpList = (env.PROXYIP || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      let proxyIpValue = "";

      const index = parseInt(proxyIpParam);
      if (!isNaN(index) && index >= 0 && index < proxyIpList.length) {
        proxyIpValue = proxyIpList[index];
      } else {
        proxyIpValue = proxyIpParam;
      }

      if (proxyIpValue) {
        targetUrl += (targetUrl.includes("?") ? "&" : "?") + "proxyip=" + encodeURIComponent(proxyIpValue);
      }
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Shadowrocket/2678 CFNetwork/3826.400.120 Darwin/24.3.0 iPhone14,4"
      }
    });

    const rawBody = await response.text();
    const subscriptionInfo = response.headers.get("Subscription-Userinfo");

    const headers = new Headers();
    if (subscriptionInfo) headers.set("Subscription-Userinfo", subscriptionInfo);

    // 获取sub参数，调用不同优选
    const subParam = parseInt(url.searchParams.get("sub") || "-1");
    if (subParam > 0) {
      const subIndex = subParam - 1;
      const modified = await getBest(env, host, uuidValue, subIndex);
      headers.set("Content-Type", "text/plain");
      return new Response(modified, { headers });
    }
    return new Response(rawBody, { headers });
  }
}

async function getBest(env, host, uuid, subIndex = 0) {
  const subList = (env.SUB_LIST || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (subIndex < 0 || subIndex >= subList.length) {
    return "无效的 sub 参数";
  }

  const templateUrl = subList[subIndex];

  const response = await fetch(templateUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const base64Data = await response.text();
  const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  let text = new TextDecoder().decode(buffer);
  text = text.split(/\r?\n/).slice(2).join("\n");
  text = text.replace(/tmpUuid/g, uuid).replace(/tmpHost/g, host);
  const modifiedBase64 = btoa(unescape(encodeURIComponent(text)));
  return modifiedBase64;
}


async function nginx() {
  const text = `
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
`
  return text;
}
