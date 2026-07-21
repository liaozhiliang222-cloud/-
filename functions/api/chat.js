// Cloudflare Pages Functions 代理：/api/chat
// 作用：把前端请求转发到 AI 提供方（智谱/Kimi/DeepSeek 等），API Key 保存在 Cloudflare
// 环境变量里（Settings → Environment variables），前端完全不暴露 Key。
//
// 支持的 provider 与对应环境变量：
//   zhipu    → ZHIPU_API_KEY     → https://open.bigmodel.cn/api/paas/v4/chat/completions
//   kimi     → KIMI_API_KEY      → https://api.moonshot.cn/v1/chat/completions
//   deepseek → DEEPSEEK_API_KEY  → https://api.deepseek.com/v1/chat/completions
//
// 部署后，在 Cloudflare Pages → Settings → Environment variables 中按需添加对应变量即可。
// 未配置环境变量的 provider 不能走代理，前端会回退到「让用户填自己的 Key」流程。

const PROVIDER_UPSTREAM = {
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    envKey: "ZHIPU_API_KEY"
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1/chat/completions",
    envKey: "KIMI_API_KEY"
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    envKey: "DEEPSEEK_API_KEY"
  }
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch (parseError) {
    return jsonResponse({ error: "请求体不是合法 JSON" }, 400);
  }

  const provider = (body.provider || "zhipu").toLowerCase();
  const cfg = PROVIDER_UPSTREAM[provider];
  if (!cfg) {
    return jsonResponse({ error: `不支持的 provider: ${provider}` }, 400);
  }

  // 从 Cloudflare 环境变量读取 Key（加密存储，前端不可见）
  const apiKey = env && env[cfg.envKey];
  if (!apiKey) {
    return jsonResponse(
      { error: `后端未配置环境变量 ${cfg.envKey}。请在 Cloudflare Pages → Settings → Environment variables 中添加。` },
      500
    );
  }

  // 转发到上游
  let upstream;
  try {
    upstream = await fetch(cfg.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": body.stream ? "text/event-stream" : "application/json"
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        temperature: body.temperature ?? 0.8,
        max_tokens: body.max_tokens ?? 4000,
        stream: !!body.stream
      })
    });
  } catch (upstreamError) {
    return jsonResponse(
      { error: `无法连接到上游服务: ${upstreamError.message || upstreamError}` },
      502
    );
  }

  // 流式响应：原样转发 ReadableStream
  if (body.stream) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        ...CORS_HEADERS
      }
    });
  }

  // 非流式：原样转发
  const respHeaders = new Headers(upstream.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}
