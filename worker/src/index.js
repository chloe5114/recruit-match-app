const ZHIPU_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ALLOWED_ORIGINS = new Set([
  "https://chloe5114.github.io",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5173",
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, model: "glm-4-flash-250414" }, 200, cors);
    }
    if (url.pathname !== "/api/parse-resume" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, cors);
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "当前来源不允许调用解析服务" }, 403, cors);
    }
    if (!env.ZHIPU_API_KEY) {
      return json({ error: "服务端尚未配置智谱 API Key" }, 503, cors);
    }

    try {
      const body = await request.json();
      const text = String(body.text || "").slice(0, 42000);
      const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
      if (!text && images.length === 0) {
        return json({ error: "未收到可解析的简历内容" }, 400, cors);
      }

      const prompt = buildPrompt(body.fileName, text, body.job);
      const model = images.length > 0 && text.length < 80
        ? "glm-4.6v-flash"
        : "glm-4-flash-250414";
      const content = images.length > 0 && text.length < 80
        ? [
            ...images.map((image) => ({
              type: "image_url",
              image_url: { url: image },
            })),
            { type: "text", text: prompt },
          ]
        : prompt;

      const zhipuResponse = await fetch(ZHIPU_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.ZHIPU_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "你是严谨的中文招聘简历解析器。只依据输入内容提取信息，不得猜测或补造。",
            },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          stream: false,
        }),
      });

      const result = await zhipuResponse.json();
      if (!zhipuResponse.ok) {
        console.error(JSON.stringify({
          event: "zhipu_error",
          status: zhipuResponse.status,
          code: result?.error?.code,
        }));
        return json({ error: "智谱模型暂时无法完成解析，请稍后重试" }, 502, cors);
      }

      const raw = result?.choices?.[0]?.message?.content || "";
      const candidate = parseJsonContent(raw);
      return json({ candidate, model }, 200, cors);
    } catch (error) {
      console.error(JSON.stringify({
        event: "parse_resume_error",
        message: error instanceof Error ? error.message : "unknown",
      }));
      return json({ error: "简历解析失败，请保留文件并稍后重试" }, 500, cors);
    }
  },
};

function buildPrompt(fileName, text, job = {}) {
  return `请将下面的候选人简历解析为严格 JSON。

文件名：${String(fileName || "").slice(0, 300)}
目标岗位：${String(job.title || "")}
岗位地点：${String(job.location || "")}
岗位关键词：${Array.isArray(job.keywords) ? job.keywords.join("、") : ""}

简历原文：
${text || "该文件为扫描件，请根据图片识别"}

返回字段：
{
  "name": "姓名；无法确认则为姓名待确认",
  "degree": "仅限博士/硕士/本科/大专/高中/待确认",
  "school": "学校；缺失则为学校待确认",
  "major": "专业",
  "graduationYear": "四位年份或空字符串",
  "years": 0,
  "skills": ["明确出现的技能"],
  "summary": "80字以内客观摘要",
  "experiences": ["实习或工作经历，每条不超过80字"],
  "projects": ["项目经历，每条不超过80字"],
  "pending": ["缺失或冲突、需要人工确认的信息"],
  "confidence": 0
}

规则：
1. 不得根据岗位要求给候选人补技能。
2. 未出现学历时 degree 必须是“待确认”，不能判定不达标。
3. years 为累计相关工作或实习年限，无法计算填 0 并加入 pending。
4. 如果文件名是“【岗位_城市 薪资】姓名 28年应届生.pdf”，应提取姓名和 2028 毕业年份。
5. 只返回 JSON，不要 Markdown。`;
}

function parseJsonContent(raw) {
  const cleaned = String(raw)
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model_response_not_json");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}
