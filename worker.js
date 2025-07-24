// Cloudflare Workers: 高可读性优化版

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const uuid = pathSegments[0];

    if (!uuid || uuid !== env.UUID) {
      return pathSegments.length === 0
        ? new Response(await renderDefaultPage(), { status: 200, headers: htmlHeader() })
        : new Response(await render404Page(), { status: 404, headers: htmlHeader() });
    }

    if (pathSegments.length === 2 && pathSegments[1] === "admin") {
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

function appendQueryParams(baseUrl, params) {
  const query = [];
  if (params.sub) query.push(`sub=${encodeURIComponent(params.sub)}`);
  if (params.proxyip) query.push(`proxyip=${encodeURIComponent(params.proxyip)}`);
  return query.length ? `${baseUrl}?${query.join("&")}` : baseUrl;
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
      ]);
      return new Response("保存成功", {
        status: 200,
        headers: { Refresh: "1" },
      });
    } catch (e) {
      return new Response(`写入失败: ${e.message}`, { status: 500 });
    }
  }

  const [kvProxyListStr, subListStr, proxyipListStr, freeListStr] = await Promise.all([
    env.KV.get("proxy_list") || "",
    env.KV.get("sub_list") || "",
    env.KV.get("proxyip_list") || "",
    env.KV.get("free_list") || "",
  ]);

  const html = renderAdminForm({
    proxy_list: kvProxyListStr,
    sub_list: subListStr,
    proxyip_list: proxyipListStr,
    free_list: freeListStr,
    proxy_list_env: env.PROXY_LIST || "",
    uuid: env.UUID,
  });

  return new Response(html, { headers: htmlHeader() });
}

// -------------------- 业务跳转逻辑 --------------------

async function handleProxy(request, env, url) {
  const { searchParams } = url;
  const idRaw = searchParams.get("id");
  const subRaw = searchParams.get("sub");
  const proxyipRaw = searchParams.get("proxyip");
  const freeRaw = searchParams.get("free");

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

  if (freeRaw !== null) {
    const freeIndex = parseInt(freeRaw);
    if (isNaN(freeIndex) || freeIndex < 0 || freeIndex >= freeList.length) {
      return new Response("Invalid free index", { status: 400 });
    }
    const targetUrl = appendQueryParams(freeList[freeIndex], { sub, proxyip });
    return Response.redirect(targetUrl, 302);
  }

  const id = parseInt(idRaw);
  if (isNaN(id) || id < 0 || id >= proxyList.length) {
    return new Response("Invalid id", { status: 400 });
  }

  const targetUrl = appendQueryParams(proxyList[id], { sub, proxyip });
  return Response.redirect(targetUrl, 302);
}

function parseIndexOrRaw(raw, list) {
  if (raw === null || raw === "") return "";
  const index = parseInt(raw);
  return !isNaN(index) && index >= 0 && index < list.length ? list[index] : raw;
}

// -------------------- 默认页面 --------------------

async function renderDefaultPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>恭喜，站点创建成功！</title><style>.container{width:60%;margin:10% auto 0;background:#f0f0f0;padding:2% 5%;border-radius:10px}ul{padding-left:20px}li{line-height:2.3}a{color:#20a53a}</style></head><body><div class="container"><h1>恭喜, 站点创建成功！</h1><h3>这是默认index.html，本页面由系统自动生成</h3><ul><li>本页面在FTP根目录下的index.html</li><li>您可以修改、删除或覆盖本页面</li><li>FTP相关信息，请到“面板系统后台 &gt; FTP” 查看</li></ul></div></body></html>`;
}

async function render404Page() {
  return `<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>`;
}

// -------------------- HTML 渲染函数 --------------------

// 管理后台页面渲染函数
function renderAdminForm({ proxy_list, sub_list, proxyip_list, free_list, proxy_list_env, uuid }) {
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
    const mainIndex = mainSelect.value;
    const subIndex = subSelect.value;
    const proxyipIndex = proxyipSelect.value;

    if (mainIndex === "") {
      previewUrlInput.value = "";
      finalUrlInput.value = "";
      return;
    }

    let previewUrl = location.origin + "/" + uuid;
    const query = [];

    if (type === 'proxy') {
      query.push("id=" + mainIndex);
    } else {
      query.push("free=" + mainIndex);
    }

    if (subIndex !== "") query.push("sub=" + encodeURIComponent(subIndex));
    if (proxyipIndex !== "") query.push("proxyip=" + encodeURIComponent(proxyipIndex));

    if (query.length) {
      previewUrl += "?" + query.join("&");
    }

    previewUrlInput.value = previewUrl;

    let baseUrl = "";
    if (type === 'proxy') {
      baseUrl = proxyList[mainIndex];
    } else {
      baseUrl = freeList[mainIndex];
    }

    const finalQuery = [];
    if (subIndex !== "") finalQuery.push("sub=" + encodeURIComponent(subList[subIndex]));
    if (proxyipIndex !== "") finalQuery.push("proxyip=" + encodeURIComponent(proxyipList[proxyipIndex]));

    const finalUrl = finalQuery.length ? baseUrl + "?" + finalQuery.join("&") : baseUrl;
    finalUrlInput.value = finalUrl;
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
