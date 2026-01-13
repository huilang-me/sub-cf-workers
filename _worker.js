/**
 * 环境变量要求:
 * env.AUTH_USERNAME      - 网页登录用户名
 * env.AUTH_PASSWORD      - 网页登录密码
 * env.UUID               - 订阅跳转专用的 UUID
 * env.KV                 - 绑定的 KV 命名空间
 * env.TURNSTILE_SITE_KEY   - (可选)
 * env.TURNSTILE_SECRET_KEY - (可选)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cookie = request.headers.get("Cookie") || "";
    
    // 生成安全哈希签名
    const getSessionHash = async () => {
      const data = new TextEncoder().encode(`${env.AUTH_USERNAME}:${env.AUTH_PASSWORD}`);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const isAuthorized = async () => {
      const expectedHash = await getSessionHash();
      return cookie.includes(`session=${expectedHash}`);
    };

    // --- 1. 公开接口：add.txt ---
    if (url.pathname === "/add.txt") {
      const addData = await env.KV.get("add");
      return new Response(addData || "", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // --- 2. 业务跳转：UUID 根路径校验 ---
    const clientUuid = url.pathname.split("/")[1]; 
    if (clientUuid === env.UUID && env.UUID) {
      return await handleProxy(request, env, url);
    }

    // --- 3. 登录逻辑 ---
    if (url.pathname === "/login") {
      if (await isAuthorized()) return Response.redirect(`${url.origin}/admin`, 302);
      
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
          if (!verifyData.success) return new Response("验证失败", { status: 403 });
        }

        if (user === env.AUTH_USERNAME && pass === env.AUTH_PASSWORD) {
          const sessionHash = await getSessionHash();
          return new Response("OK", {
            status: 302,
            headers: {
              "Set-Cookie": `session=${sessionHash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure`,
              "Location": "/admin",
            },
          });
        }
        return new Response("账号或密码错误", { status: 401 });
      }
      return new Response(renderLoginPage(env.TURNSTILE_SITE_KEY), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // --- 4. 登出逻辑 ---
    if (url.pathname === "/logout") {
      return new Response("Logged out", {
        status: 302,
        headers: {
          "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax",
          "Location": "/login",
        },
      });
    }

    // --- 5. 鉴权守卫 ---
    if (!(await isAuthorized())) {
      return Response.redirect(`${url.origin}/login`, 302);
    }

    if (url.pathname === "/" || url.pathname === "/admin") {
      return await handleAdmin(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// -------------------- 业务处理逻辑 --------------------

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
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  }

  const [p, s, pi, f, a] = await Promise.all([
    env.KV.get("proxy_list") || "",
    env.KV.get("sub_list") || "",
    env.KV.get("proxyip_list") || "",
    env.KV.get("free_list") || "",
    env.KV.get("add") || "",
  ]);

  return new Response(renderAdminForm({
    proxy_list: p, sub_list: s, proxyip_list: pi, free_list: f, add: a,
    proxy_list_env: env.PROXY_LIST || "",
    uuid: env.UUID,
    url: new URL(request.url)
  }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
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

// -------------------- UI 模板 --------------------

function renderLoginPage(siteKey) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>系统登录</title>
  ${siteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
  <style>
    body{font-family:system-ui,sans-serif;background:#f0f2f5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
    .card{background:#fff;padding:2rem;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.1);width:100%;max-width:350px}
    input{width:100%;padding:12px;margin-bottom:1rem;border:1px solid #ddd;border-radius:8px;box-sizing:border-box}
    button{width:100%;padding:12px;background:#1a73e8;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold}
  </style></head><body><div class="card"><h2 style="text-align:center;color:#1a73e8">管理后台</h2><form method="POST">
  <input name="username" placeholder="用户名" required>
  <input type="password" name="password" placeholder="密码" required>
  ${siteKey ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="light" style="display:flex;justify-content:center;margin-bottom:1rem"></div>` : ''}
  <button type="submit">登 录</button></form></div></body></html>`;
}

function renderAdminForm(data) {
  const escape = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const proxyListJSON = JSON.stringify(parseEnvList(data.proxy_list_env + '\n' + data.proxy_list));
  const freeListJSON = JSON.stringify(parseEnvList(data.free_list));
  const subListJSON = JSON.stringify(parseEnvList(data.sub_list));
  const proxyipListJSON = JSON.stringify(parseEnvList(data.proxyip_list));

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>管理面板</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:15px;background:#f8f9fa;font-size:14px;color:#333}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:10px;margin-bottom:20px}
    .logout{color:#d93025;text-decoration:none;border:1px solid #d93025;padding:4px 10px;border-radius:6px;font-size:13px}
    label{display:block;font-weight:bold;margin:15px 0 5px}
    textarea{width:100%;height:100px;padding:10px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;font-family:monospace;font-size:13px}
    .env-notice pre{background:#eee;padding:10px;border-radius:6px;border:1px solid #ddd;color:#666;font-size:11px;white-space:pre-wrap;margin:5px 0;overflow:auto;max-height:150px}
    .save-btn{background:#1a73e8;color:white;padding:12px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;width:100%;margin-top:20px;font-size:16px}
    .container{background:#fff;padding:15px;border-radius:12px;border:1px solid #e0e0e0;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-top:30px}
    .form-group{margin-bottom:15px}
    select, input[type="text"]{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;text-overflow:ellipsis}
    option{text-overflow:ellipsis; overflow:hidden;}
    .input-with-btn{display:flex;gap:8px}
    .input-with-btn input{flex:1}
    .copy-btn{padding:0 15px;background:#1a73e8;color:white;border:none;border-radius:8px;cursor:pointer;white-space:nowrap}
    @media (max-width: 600px) { .input-with-btn{flex-direction:column} .copy-btn{padding:10px;width:100%} }
  </style></head><body>
  <div class="header"><strong>配置中心</strong><a href="/logout" class="logout">退出登录</a></div>
  
  <form method="POST">
    ${data.proxy_list_env ? `<div class="env-notice"><label>环境变量 PROXY_LIST (只读):</label><pre>${escape(data.proxy_list_env)}</pre></div>` : ""}
    <label>proxy_list (KV 存储):</label><textarea name="proxy_list" placeholder="每行一个链接">${escape(data.proxy_list)}</textarea>
    <label>sub_list:</label><textarea name="sub_list">${escape(data.sub_list)}</textarea>
    <label>proxyip_list:</label><textarea name="proxyip_list">${escape(data.proxyip_list)}</textarea>
    <label>free_list:</label><textarea name="free_list">${escape(data.free_list)}</textarea>
    <label>add.txt: <span style="font-weight:normal;font-size:12px;color:#666">每行一个地址，暴露在 <code>${data.url.origin}/add.txt</code></span></label>
    <textarea name="add" placeholder="地址#备注">${escape(data.add)}</textarea>
    <button type="submit" class="save-btn">保存更改</button>
  </form>

  <div class="container">
    <h3 style="margin-top:0;color:#1a73e8">订阅预览生成器</h3>
    <div class="form-group"><label>模式</label><select id="typeSelect"><option value="proxy">节点订阅 (id)</option><option value="free">免费源 (free)</option></select></div>
    <div class="form-group"><label>选择条目</label><select id="mainSelect"></select></div>
    <div class="form-group"><label>搭配 sub_list</label><select id="subSelect"></select></div>
    <div class="form-group"><label>搭配 proxyip_list</label><select id="proxyipSelect"></select></div>
    <div class="form-group"><label>订阅地址</label><div class="input-with-btn"><input type="text" id="previewUrl" readonly><button type="button" class="copy-btn" onclick="copyText('previewUrl')">复制链接</button></div></div>
    <div class="form-group"><label>最终跳转地址</label><input type="text" id="finalUrl" readonly style="background:#f0f0f0;color:#666"></div>
  </div>

  <script>
    const proxyList = ${proxyListJSON}, freeList = ${freeListJSON}, subList = ${subListJSON}, proxyipList = ${proxyipListJSON}, uuid = "${data.uuid}";
    const typeSel = document.getElementById('typeSelect'), mainSel = document.getElementById('mainSelect'), subSel = document.getElementById('subSelect'), pipSel = document.getElementById('proxyipSelect'), preInp = document.getElementById('previewUrl'), finInp = document.getElementById('finalUrl');

    function fill(el, list, hasEmpty=true) {
      el.innerHTML = hasEmpty ? '<option value="">无</option>' : '';
      list.forEach((item, i) => { const opt = document.createElement('option'); opt.value = i; opt.textContent = i + ": " + item; el.appendChild(opt); });
    }

    function update() {
      const type = typeSel.value, mIdx = mainSel.value, sIdx = subSel.value, pIdx = pipSel.value;
      if (mIdx === "") return;
      let subUrl = window.location.origin + "/" + uuid;
      const params = new URLSearchParams();
      params.set(type === 'proxy' ? 'id' : 'free', mIdx);
      if (sIdx !== "") params.set('sub', sIdx);
      if (pIdx !== "") params.set('proxyip', pIdx);
      preInp.value = subUrl + "?" + params.toString();
      let base = (type === 'proxy' ? proxyList[mIdx] : freeList[mIdx]) || "";
      try {
        let u = new URL(base.split('#')[0]);
        if (sIdx !== "") u.searchParams.set('sub', subList[sIdx].split('#')[0]);
        if (pIdx !== "") u.searchParams.set('proxyip', proxyipList[pIdx].split('#')[0]);
        finInp.value = u.toString() + (base.includes('#') ? '#' + base.split('#')[1] : '');
      } catch(e) { finInp.value = base; }
    }

    typeSel.onchange = () => { fill(mainSel, typeSel.value==='proxy'?proxyList:freeList, false); update(); };
    mainSel.onchange = update; subSel.onchange = update; pipSel.onchange = update;
    fill(subSel, subList); fill(pipSel, proxyipList); fill(mainSel, proxyList, false); update();

    function copyText(id) {
      const el = document.getElementById(id); el.select();
      navigator.clipboard.writeText(el.value).then(() => alert('已复制到剪贴板'));
    }
  </script>
  </body></html>`;
}
