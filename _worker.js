export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cookie = request.headers.get("Cookie") || "";
    const isAuthorized = () => cookie.includes(`session=${env.AUTH_PASSWORD}`);

    // --- 1. 公开接口：add.txt ---
    if (url.pathname === "/add.txt") {
      const addData = await env.KV.get("add");
      return new Response(addData || "", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // --- 2. 业务跳转：UUID 路径校验 ---
    if (url.pathname.startsWith("/jump/")) {
      const pathSegments = url.pathname.split("/");
      const clientUuid = pathSegments[2];
      if (!clientUuid || clientUuid !== env.UUID) {
        return new Response("Unauthorized: Invalid UUID", { status: 401 });
      }
      return await handleProxy(request, env, url);
    }

    // --- 3. 登录/登出 ---
    if (url.pathname === "/login") {
      if (isAuthorized()) return Response.redirect(`${url.origin}/admin`, 302);
      return await handleLogin(request, env);
    }

    if (url.pathname === "/logout") {
      return new Response("Logged out", {
        status: 302,
        headers: {
          "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax",
          "Location": "/login",
        },
      });
    }

    // --- 4. 鉴权守卫 ---
    if (!isAuthorized()) {
      return Response.redirect(`${url.origin}/login`, 302);
    }

    if (url.pathname === "/" || url.pathname === "/admin") {
      return await handleAdmin(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// -------------------- 逻辑处理模块 --------------------

async function handleLogin(request, env) {
  if (request.method === "POST") {
    const formData = await request.formData();
    const user = formData.get("username");
    const pass = formData.get("password");
    const turnstileToken = formData.get("cf-turnstile-response");

    if (env.TURNSTILE_SECRET_KEY) {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${env.TURNSTILE_SECRET_KEY}&response=${turnstileToken}`,
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) return new Response("验证码校验失败", { status: 403 });
    }

    if (user === env.AUTH_USERNAME && pass === env.AUTH_PASSWORD) {
      return new Response("OK", {
        status: 302,
        headers: {
          "Set-Cookie": `session=${env.AUTH_PASSWORD}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
          "Location": "/admin",
        },
      });
    }
    return new Response("账号或密码错误", { status: 401 });
  }
  return new Response(renderLoginPage(env.TURNSTILE_SITE_KEY), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleAdmin(request, env) {
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      await Promise.all([
        env.KV.put("proxy_list", formData.get("proxy_list") || ""),
        env.KV.put("sub_list", formData.get("sub_list") || ""),
        env.KV.put("proxyip_list", formData.get("proxyip_list") || ""),
        env.KV.put("free_list", formData.get("free_list") || ""),
        env.KV.put("add", formData.get("add") || ""),
      ]);
      return new Response("保存成功", { status: 200, headers: { Refresh: "1" } });
    } catch (e) {
      return new Response(`保存失败: ${e.message}`, { status: 500 });
    }
  }

  const [p, s, pi, f, a] = await Promise.all([
    env.KV.get("proxy_list") || "",
    env.KV.get("sub_list") || "",
    env.KV.get("proxyip_list") || "",
    env.KV.get("free_list") || "",
    env.KV.get("add") || "",
  ]);

  const html = renderAdminForm({
    proxy_list: p, sub_list: s, proxyip_list: pi, free_list: f, add: a,
    proxy_list_env: env.PROXY_LIST || "",
    uuid: env.UUID,
    url: new URL(request.url)
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleProxy(request, env, url) {
  const { searchParams } = url;
  const type = searchParams.has("free") ? "free" : "proxy";
  const mainIndex = parseInt(searchParams.get(type === "proxy" ? "id" : "free"));
  
  const [kvP, kvS, kvPI, kvF] = await Promise.all([
    env.KV.get("proxy_list") || "",
    env.KV.get("sub_list") || "",
    env.KV.get("proxyip_list") || "",
    env.KV.get("free_list") || "",
  ]);

  const proxyList = parseEnvList((env.PROXY_LIST || "") + "\n" + kvP);
  const subList = parseEnvList(kvS);
  const proxyIpList = parseEnvList(kvPI);
  const freeList = parseEnvList(kvF);

  const sub = parseIndexOrRaw(searchParams.get("sub"), subList);
  const proxyip = parseIndexOrRaw(searchParams.get("proxyip"), proxyIpList);

  const targetUrl = buildTargetUrl({ type, mainIndex, sub, proxyip, proxyList, freeList });
  return targetUrl ? Response.redirect(targetUrl, 302) : new Response("Invalid Index", { status: 400 });
}

// -------------------- 工具函数 --------------------

function parseEnvList(str) { return (str || "").split("\n").map(l => l.trim()).filter(l => l !== ""); }
function parseIndexOrRaw(raw, list) {
  if (!raw) return "";
  const i = parseInt(raw);
  return (!isNaN(i) && i >= 0 && i < list.length) ? list[i] : raw;
}

function buildTargetUrl({ type, mainIndex, sub, proxyip, proxyList, freeList }) {
  let baseUrl = type === "proxy" ? proxyList[mainIndex] : freeList[mainIndex];
  if (!baseUrl) return null;
  let hash = "";
  const hIdx = baseUrl.indexOf("#");
  if (hIdx !== -1) { hash = baseUrl.slice(hIdx); baseUrl = baseUrl.slice(0, hIdx); }
  try {
    const urlObj = new URL(baseUrl);
    if (sub) urlObj.searchParams.set("sub", sub.split("#")[0]);
    if (proxyip) urlObj.searchParams.set("proxyip", proxyip.split("#")[0]);
    return urlObj.origin + urlObj.pathname + "?" + urlObj.searchParams.toString() + hash;
  } catch (e) { return baseUrl; }
}

// -------------------- UI 页面模板 --------------------

function renderLoginPage(siteKey) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>登录</title>
  ${siteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
  <style>
    body{font-family:system-ui,sans-serif;background:#f0f2f5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
    .card{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.1);width:100%;max-width:350px}
    h2{text-align:center;color:#1a73e8;margin-bottom:1.5rem}
    input{width:100%;padding:12px;margin-bottom:1rem;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;font-size:16px}
    button{width:100%;padding:12px;background:#1a73e8;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:16px}
  </style></head><body><div class="card"><h2>管理登录</h2><form method="POST">
  <input name="username" placeholder="用户名" required autocomplete="username">
  <input type="password" name="password" placeholder="密码" required autocomplete="current-password">
  ${siteKey ? `<div class="cf-turnstile" data-sitekey="${siteKey}" style="display:flex;justify-content:center;margin-bottom:1rem"></div>` : ''}
  <button type="submit">登 录</button></form></div></body></html>`;
}

function renderAdminForm(data) {
  const escape = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  // 准备 JavaScript 预览器所需数据
  const proxyListJSON = JSON.stringify(parseEnvList(data.proxy_list_env + '\n' + data.proxy_list));
  const freeListJSON = JSON.stringify(parseEnvList(data.free_list));
  const subListJSON = JSON.stringify(parseEnvList(data.sub_list));
  const proxyipListJSON = JSON.stringify(parseEnvList(data.proxyip_list));

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>管理面板</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:20px;background:#f8f9fa;font-size:14px}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:10px;margin-bottom:20px}
    .logout{color:#d93025;text-decoration:none;border:1px solid #d93025;padding:4px 12px;border-radius:6px}
    label{display:block;font-weight:bold;margin:15px 0 5px}
    textarea{width:100%;height:80px;padding:10px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;font-family:monospace}
    button.save-btn{background:#1a73e8;color:white;padding:12px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;width:100%;margin-top:20px;font-size:16px}
    hr{margin:40px 0;border:0;border-top:1px solid #ddd}
    .container{background:#fff;padding:20px;border-radius:12px;border:1px solid #eee;box-shadow:0 2px 10px rgba(0,0,0,0.05)}
    .form-row{display:flex;align-items:center;gap:10px;margin-bottom:15px}
    .form-row label{flex:0 0 150px;margin:0}
    select, input[type="text"]{flex:1;padding:8px;border:1px solid #ddd;border-radius:6px}
    .copy-btn{padding:8px 15px;background:#1a73e8;color:white;border:none;border-radius:6px;cursor:pointer}
  </style></head><body>
  <div class="header"><strong>Cloudflare Pages 管理员</strong><a href="/logout" class="logout">退出登录</a></div>
  
  <form method="POST">
    <label>proxy_list (Workers 节点):</label><textarea name="proxy_list">${escape(data.proxy_list)}</textarea>
    <label>sub_list (sub 参数):</label><textarea name="sub_list">${escape(data.sub_list)}</textarea>
    <label>proxyip_list (proxyip 参数):</label><textarea name="proxyip_list">${escape(data.proxyip_list)}</textarea>
    <label>free_list (免费订阅源):</label><textarea name="free_list">${escape(data.free_list)}</textarea>
    <label>add.txt (公开接口内容):</label><textarea name="add">${escape(data.add)}</textarea>
    <button type="submit" class="save-btn">保存更改</button>
  </form>

  <hr />

  <div class="container">
    <h2 style="text-align:center;color:#1a73e8">预览订阅链接生成器</h2>
    <div class="form-row">
      <label>选择类型</label>
      <select id="typeSelect"><option value="proxy">代理订阅 (id)</option><option value="free">免费订阅 (free)</option></select>
    </div>
    <div class="form-row">
      <label>列表索引 (Index)</label>
      <select id="mainSelect"></select>
    </div>
    <div class="form-row">
      <label>sub_list (可选)</label>
      <select id="subSelect"><option value="">不使用</option></select>
    </div>
    <div class="form-row">
      <label>proxyip_list (可选)</label>
      <select id="proxyipSelect"><option value="">不使用</option></select>
    </div>
    <div class="form-row">
      <label>订阅地址</label>
      <input type="text" id="previewUrl" readonly>
      <button class="copy-btn" onclick="copyText('previewUrl')">复制</button>
    </div>
    <div class="form-row">
      <label>最终跳转地址</label>
      <input type="text" id="finalUrl" readonly>
    </div>
  </div>

  <script>
    const proxyList = ${proxyListJSON};
    const freeList = ${freeListJSON};
    const subList = ${subListJSON};
    const proxyipList = ${proxyipListJSON};
    const uuid = "${data.uuid}";

    const typeSelect = document.getElementById('typeSelect');
    const mainSelect = document.getElementById('mainSelect');
    const subSelect = document.getElementById('subSelect');
    const proxyipSelect = document.getElementById('proxyipSelect');
    const previewUrlInput = document.getElementById('previewUrl');
    const finalUrlInput = document.getElementById('finalUrl');

    function populate(el, list, hasEmpty=true) {
      el.innerHTML = hasEmpty ? '<option value="">不使用</option>' : '';
      list.forEach((item, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i + " - " + item.slice(0, 40);
        el.appendChild(opt);
      });
    }

    function update() {
      const type = typeSelect.value;
      const mIdx = parseInt(mainSelect.value);
      const sIdx = subSelect.value !== "" ? parseInt(subSelect.value) : null;
      const pIdx = proxyipSelect.value !== "" ? parseInt(proxyipSelect.value) : null;

      if (isNaN(mIdx)) return;

      // 生成订阅地址 (跳转路径)
      let subUrl = window.location.origin + "/jump/" + uuid;
      const params = new URLSearchParams();
      if (type === 'proxy') params.set('id', mIdx); else params.set('free', mIdx);
      if (sIdx !== null) params.set('sub', sIdx);
      if (pIdx !== null) params.set('proxyip', pIdx);
      previewUrlInput.value = subUrl + "?" + params.toString();

      // 计算最终跳转目标
      let base = (type === 'proxy' ? proxyList[mIdx] : freeList[mIdx]) || "";
      try {
        let u = new URL(base.split('#')[0]);
        if (sIdx !== null) u.searchParams.set('sub', subList[sIdx].split('#')[0]);
        if (pIdx !== null) u.searchParams.set('proxyip', proxyipList[pIdx].split('#')[0]);
        finalUrlInput.value = u.toString() + (base.includes('#') ? '#' + base.split('#')[1] : '');
      } catch(e) { finalUrlInput.value = base; }
    }

    function initMain() {
      populate(mainSelect, typeSelect.value === 'proxy' ? proxyList : freeList, false);
      update();
    }

    typeSelect.onchange = initMain;
    mainSelect.onchange = update;
    subSelect.onchange = update;
    proxyipSelect.onchange = update;

    function copyText(id) {
      const el = document.getElementById(id);
      el.select();
      document.execCommand('copy');
      alert('已复制');
    }

    populate(subSelect, subList);
    populate(proxyipSelect, proxyipList);
    initMain();
  </script>
  </body></html>`;
}
