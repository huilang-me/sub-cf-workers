export default {
  async fetch(request, env, ctx) {
    // 检查关键配置
    if (!env.UUID) {
      return new Response(renderMissingConfigPage("环境变量 <code>UUID</code> 未设置。"), {
        status: 500,
        headers: htmlHeader(),
      });
    }

    if (!env.KV || typeof env.KV.get !== "function") {
      return new Response(renderMissingConfigPage("KV 命名空间 <code>KV</code> 未绑定或绑定错误。"), {
        status: 500,
        headers: htmlHeader(),
      });
    }

    const url = new URL(request.url);

    // 返回地址列表
    if (url.pathname === `/add.txt`) {
      const addData = await env.KV.get("add");
      return new Response(addData || "", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);
    const uuid = pathSegments[0];

    if (!uuid || uuid !== env.UUID) {
      return new Response(await renderDefaultPage(url), { status: 404, headers: htmlHeader() });
    }

    // 返回管理页面
    if (url.href === url.origin + "/" + env.UUID) {
      return await handleAdmin(request, env);
    }

    return await handleProxy(request, env, url);
  },
};

// -------------------- 工具函数 --------------------

function htmlHeader() {
  return { "Content-Type": "text/html; charset=utf-8" };
}

function parseEnvList(str) {
  return (str || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function parseIndexOrRaw(raw, list) {
  if (raw === null || raw === "") return "";
  const index = parseInt(raw);
  return !isNaN(index) && index >= 0 && index < list.length ? list[index] : raw;
}

// -------------------- 统一生成跳转 URL --------------------

function buildTargetUrl({ type, mainIndex, sub, proxyip, proxyList, freeList }) {
  let baseUrl = "";
  if (type === "proxy") {
    if (isNaN(mainIndex) || mainIndex < 0 || mainIndex >= proxyList.length) return null;
    baseUrl = proxyList[mainIndex];
  } else if (type === "free") {
    if (isNaN(mainIndex) || mainIndex < 0 || mainIndex >= freeList.length) return null;
    baseUrl = freeList[mainIndex];
  } else {
    return null;
  }

  baseUrl = baseUrl.split("#")[0];

  const query = [];
  if (sub) query.push("sub=" + encodeURIComponent(sub));
  if (proxyip) query.push("proxyip=" + encodeURIComponent(proxyip));

  return query.length ? baseUrl + "?" + query.join("&") : baseUrl;
}

// -------------------- 管理后台逻辑 --------------------

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
      return new Response("保存成功", {
        status: 200,
        headers: { Refresh: "1" },
      });
    } catch (e) {
      return new Response(`写入失败: ${e.message}`, { status: 500 });
    }
  }

  const [kvProxyListStr, subListStr, proxyipListStr, freeListStr, addStr] = await Promise.all([
    env.KV.get("proxy_list") || "",
    env.KV.get("sub_list") || "",
    env.KV.get("proxyip_list") || "",
    env.KV.get("free_list") || "",
    env.KV.get("add") || "",
  ]);

  const html = renderAdminForm({
    proxy_list: kvProxyListStr,
    sub_list: subListStr,
    proxyip_list: proxyipListStr,
    free_list: freeListStr,
    add: addStr,
    proxy_list_env: env.PROXY_LIST || "",
    uuid: env.UUID,
    url: new URL(request.url),
  });

  return new Response(html, { headers: htmlHeader() });
}

// -------------------- 业务跳转逻辑 --------------------

async function handleProxy(request, env, url) {
  const { searchParams } = url;
  const type = searchParams.has("free") ? "free" : "proxy";
  const mainIndex = parseInt(searchParams.get(type === "proxy" ? "id" : "free"));
  const subRaw = searchParams.get("sub");
  const proxyipRaw = searchParams.get("proxyip");

  const [kvProxyListStr, subListStr, proxyIpListStr, freeListStr] = await Promise.all([
    env.KV.get("proxy_list") || "",
    env.KV.get("sub_list") || "",
    env.KV.get("proxyip_list") || "",
    env.KV.get("free_list") || "",
  ]);

  const proxyList = parseEnvList((env.PROXY_LIST || "") + "\n" + kvProxyListStr);
  const subList = parseEnvList(subListStr);
  const proxyIpList = parseEnvList(proxyIpListStr);
  const freeList = parseEnvList(freeListStr);

  const sub = parseIndexOrRaw(subRaw, subList);
  const proxyip = parseIndexOrRaw(proxyipRaw, proxyIpList);

  const targetUrl = buildTargetUrl({ type, mainIndex, sub, proxyip, proxyList, freeList });
  if (!targetUrl) {
    return new Response("Invalid index", { status: 400 });
  }

  return Response.redirect(targetUrl, 302);
}

// -------------------- 默认页面 --------------------

async function renderDefaultPage(url) {
  const origin = url.origin;
  return `
    <html>
      <head><title>欢迎</title></head>
      <body>
        <div style="background-color:#f7f7f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; height:100vh; display:flex; justify-content:center; align-items:center;"> 
          <div style="background:white; padding:30px 40px; border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,0.05); text-align:center;"> 
            <h1 style="font-size:1.8em; margin-bottom:12px; color:#007acc;">欢迎使用</h1> 
            <p style="font-size:1em; color:#555;">请通过 <code style="background-color:#f0f0f0; padding:2px 6px; border-radius:4px; font-family:monospace;">${origin}/{uuid}</code> 访问管理页面</p> 
          </div> 
        </div>
      </body>
    </html>`;
}

// -------------------- HTML 渲染函数 --------------------

function renderAdminForm({ proxy_list, sub_list, proxyip_list, free_list, add, proxy_list_env, uuid, url }) {
  const escape = (str) => (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const renderField = (id, label, tip, value, placeholder) => `
    <label for="${id}">${label}</label>
    <div class="tip">${tip}</div>
    <textarea id="${id}" name="${id}" placeholder="${placeholder}">${escape(value)}</textarea>
  `;
  const proxyListNotice = proxy_list_env
    ? `<pre style="margin-bottom: 15px;">🌐 来自环境变量 PROXY_LIST:\n${escape(proxy_list_env)}</pre>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>KV 数据管理面板</title>
  ${renderCommonStyles()}
</head>
<body>
  <h1>KV 数据管理面板</h1>
  <form method="POST" autocomplete="off" spellcheck="false" novalidate>
    ${proxyListNotice}
    ${renderField("proxy_list", "proxy_list", "每行一个 Workers 订阅 URL", proxy_list, "https://xx.example.workers.dev/xxxxx\nhttps://example.com/proxy2")}
    ${renderField("sub_list", "sub_list", "每行一个 sub 参数值", sub_list, "sub.cmliussss.net\nsub2")}
    ${renderField("proxyip_list", "proxyip_list", "每行一个 proxyip 参数值", proxyip_list, "ProxyIP.US.CMLiussss.net\nproxyip2")}
    ${renderField("free_list", "free_list", "每行一个免费订阅 URL", free_list, "https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2\nhttps://example.com/free2")}
    ${renderField(
      "add",
      "add",
      "每行一个地址，将暴露在 <code>" + url.origin + "/add.txt</code> 接口",
      add,
      "nrtcfdns.zone.id:443#优选域名1\nlaxcfdns.zone.id:443#优选域名2"
    )}
    <button type="submit">保存修改</button>
  </form>

  ${renderPreviewBuilder({ proxy_list, sub_list, proxyip_list, free_list, proxy_list_env, uuid })}
</body>
</html>`;
}

function renderPreviewBuilder(data) {
  const proxyList = JSON.stringify(parseEnvList(data.proxy_list_env + '\n' + data.proxy_list));
  const freeList = JSON.stringify(parseEnvList(data.free_list));
  const subList = JSON.stringify(parseEnvList(data.sub_list));
  const proxyipList = JSON.stringify(parseEnvList(data.proxyip_list));
  const uuid = data.uuid || "your-uuid-here";

  return `
${renderCommonStyles()}

<hr />
<div class="container">
  <h2>预览订阅链接生成器</h2>

  <div class="form-row">
    <label for="typeSelect">选择类型</label>
    <select id="typeSelect" name="typeSelect" aria-label="选择类型">
      <option value="proxy">代理订阅（id）</option>
      <option value="free">免费订阅（free）</option>
    </select>
  </div>

  <div class="form-row">
    <label for="mainSelect">proxy_list / free_list 索引</label>
    <select id="mainSelect" name="mainSelect" aria-label="proxy_list 或 free_list 索引"></select>
  </div>

  <div class="form-row">
    <label for="subSelect">sub_list（可选）</label>
    <select id="subSelect" name="subSelect" aria-label="sub_list 选择">
      <option value="">不使用</option>
    </select>
  </div>

  <div class="form-row">
    <label for="proxyipSelect">proxyip_list（可选）</label>
    <select id="proxyipSelect" name="proxyipSelect" aria-label="proxyip_list 选择">
      <option value="">不使用</option>
    </select>
  </div>

  <div class="url-section form-row" style="flex-wrap: nowrap;">
    <label for="previewUrl" style="flex: 0 0 120px;">订阅地址</label>
    <input type="text" id="previewUrl" readonly aria-readonly="true" />
    <button type="button" onclick="copyUrl()" aria-label="复制">复制</button>
  </div>

  <div class="url-section form-row" style="flex-wrap: nowrap;">
    <label for="finalUrl" style="flex: 0 0 120px;">最终跳转地址</label>
    <input type="text" id="finalUrl" readonly aria-readonly="true" />
  </div>
</div>

<div style="text-align: center; margin-top: 40px; font-size: 0.9em; color: #888;">
  📦 Github项目地址 <a href="https://github.com/huilang-me/sub-cf-workers" target="_blank" style="color: #007acc; text-decoration: none;">huilang-me/sub-cf-workers</a>
</div>

<script>
  const proxyList = ${proxyList};
  const freeList = ${freeList};
  const subList = ${subList};
  const proxyipList = ${proxyipList};
  const uuid = "${uuid}";

  const typeSelect = document.getElementById('typeSelect');
  const mainSelect = document.getElementById('mainSelect');
  const subSelect = document.getElementById('subSelect');
  const proxyipSelect = document.getElementById('proxyipSelect');
  const previewUrlInput = document.getElementById('previewUrl');
  const finalUrlInput = document.getElementById('finalUrl');

  function populateSelect(select, list, includeEmpty = true) {
    select.innerHTML = includeEmpty ? '<option value="">不使用</option>' : '';
    list.forEach((item, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i + ' - ' + item.slice(0, 50);
      select.appendChild(opt);
    });
  }

  function updateMainOptions() {
    const type = typeSelect.value;
    if (type === 'proxy') {
      populateSelect(mainSelect, proxyList, false);
    } else {
      populateSelect(mainSelect, freeList, false);
    }
    updateUrls();
  }

  function updateUrls() {
    const type = typeSelect.value;
    const mainIndex = parseInt(mainSelect.value);
    const subIndex = subSelect.value ? parseInt(subSelect.value) : null;
    const proxyipIndex = proxyipSelect.value ? parseInt(proxyipSelect.value) : null;

    if (isNaN(mainIndex)) {
      previewUrlInput.value = "";
      finalUrlInput.value = "";
      return;
    }

    // preview 地址
    let previewUrl = location.origin + "/" + uuid;
    const query = [];
    if (type === "proxy") query.push("id=" + mainIndex);
    else query.push("free=" + mainIndex);
    if (subIndex !== null) query.push("sub=" + subIndex);
    if (proxyipIndex !== null) query.push("proxyip=" + proxyipIndex);
    previewUrlInput.value = previewUrl + "?" + query.join("&");

    // 最终跳转地址（复用统一函数逻辑）
    const sub = subIndex !== null ? subList[subIndex] : "";
    const proxyip = proxyipIndex !== null ? proxyipList[proxyipIndex] : "";
    const finalUrl = (${buildTargetUrl.toString()})({
      type, mainIndex, sub, proxyip, proxyList, freeList
    });
    finalUrlInput.value = finalUrl || "";
  }

  function copyUrl() {
    previewUrlInput.select();
    previewUrlInput.setSelectionRange(0, 99999);
    document.execCommand('copy');
    alert('已复制链接：' + previewUrlInput.value);
  }

  updateMainOptions();
  populateSelect(subSelect, subList);
  populateSelect(proxyipSelect, proxyipList);

  typeSelect.addEventListener('change', updateMainOptions);
  mainSelect.addEventListener('change', updateUrls);
  subSelect.addEventListener('change', updateUrls);
  proxyipSelect.addEventListener('change', updateUrls);
</script>
`;
}

function renderCommonStyles() {
  return `
<style>
  /* 全局样式及字体 */
  body, input, select, button, label, textarea {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    box-sizing: border-box;
    color: #333;
  }

  body {
    max-width: 960px;
    margin: 40px auto;
    padding: 0 20px 40px;
    background: #fff;
    font-size:14px;
  }

  h1, h2 {
    color: #007acc;
  }

  h1 {
    font-weight: 700;
    font-size: 2rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  h2 {
    margin-bottom: 20px;
    font-weight: 600;
    font-size: 1.5em;
    text-align: center;
  }

  /* form 样式 */
  form {
    margin: 0 auto 50px;
  }

  label {
    display: block;
    font-weight: 600;
    margin-bottom: 6px;
    color: #222;
  }

  .tip {
    font-size: 0.9em;
    color: #666;
    margin-bottom: 10px;
  }

  textarea {
    width: 100%;
    min-height: 120px;
    padding: 10px 14px;
    font-family: monospace;
    font-size: 1em;
    border: 1px solid #ccc;
    border-radius: 6px;
    resize: vertical;
    transition: border-color 0.2s ease;
  }
  textarea:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 5px rgba(0, 122, 204, 0.5);
  }

  pre {
    background: #f9f9f9;
    border: 1px solid #ccc;
    padding: 12px 16px;
    border-radius: 6px;
    color: #555;
    white-space: pre-wrap;
    margin-bottom: 15px;
    font-size: 0.95rem;
  }

  button[type="submit"], button {
    display: inline-block;
    padding: 6px 20px;
    font-size: 1em;
    font-weight: 700;
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    user-select: none;
    min-width: 80px;
  }

  button[type="submit"]:hover,
  button[type="submit"]:focus,
  button:hover,
  button:focus {
    background-color: #005fa3;
    outline: none;
  }

  hr {
    margin: 40px 0;
    border: none;
    border-top: 1px solid #ddd;
  }

  .container {
    margin: 0 auto;
    padding: 0 15px 30px;
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
    flex-wrap: wrap;
  }

  .form-row > label {
    flex: 0 0 120px;
    min-width: 100px;
    font-weight: 600;
    color: #333;
  }

  .form-row > select,
  .form-row > input[type="text"] {
    flex: 1 1 auto;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1em;
    min-width: 150px;
    transition: border-color 0.2s ease;
  }
  .form-row > select:focus,
  .form-row > input[type="text"]:focus {
    border-color: #007acc;
    outline: none;
    box-shadow: 0 0 6px rgba(0, 122, 204, 0.5);
  }

  .url-section {
    margin-top: 25px;
  }

  input[readonly] {
    background-color: #f9f9f9;
    cursor: text;
  }

  /* 响应式布局 */
  @media (max-width: 600px) {
    body {
      max-width: 100%;
      margin: 20px;
      padding: 0 12px 30px;
    }

    form,
    .container {
      max-width: 100%;
      padding: 0;
    }

    .form-row {
      flex-direction: column;
      align-items: stretch;
    }

    .form-row > label {
      flex: none;
      margin-bottom: 6px;
      width: 100%;
    }

    .form-row > select,
    .form-row > input[type="text"],
    textarea,
    button {
      width: 100%;
      min-width: auto;
    }

    button[type="submit"] {
      margin: 30px 0 0;
    }

    .url-section.form-row {
      flex-wrap: nowrap;
      flex-direction: column;
    }

    .url-section.form-row > label {
      flex: none;
      width: 100%;
      margin-bottom: 6px;
    }

    .url-section.form-row > input,
    .url-section.form-row > button {
      width: 100%;
      margin-top: 6px;
      min-width: auto;
    }

    .url-section.form-row > button {
      margin-top: 10px;
    }
  }
</style>
`;
}
function renderMissingConfigPage(message) {
  return `
  <!DOCTYPE html>
  <html><head><meta charset="UTF-8"><title>配置错误</title></head>
  <body style="font-family: sans-serif; padding: 2rem;">
    <h1 style="color: red;">配置错误</h1>
    <p>${message}</p>
    <ul>
      <li>请确认 Wrangler 配置了所需的 <strong>环境变量</strong> 和 <strong>KV 命名空间</strong></li>
      <li>必要环境变量: <code>UUID</code></li>
      <li>必要 KV 命名空间: <code>KV</code></li>
    </ul>
  </body></html>`;
}
