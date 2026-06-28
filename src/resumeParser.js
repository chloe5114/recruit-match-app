import { jsonrepair } from "jsonrepair";

const SKILL_DICTIONARY = [
  "Excel",
  "SQL",
  "Python",
  "Power BI",
  "Tableau",
  "Figma",
  "Axure",
  "PRD",
  "数据分析",
  "内容运营",
  "社群运营",
  "活动策划",
  "用户增长",
  "排班",
  "运营支持",
  "项目管理",
  "用户访谈",
  "商业分析",
  "行业研究",
  "建模",
  "沟通",
  "复盘",
];

const AI_API_URL = import.meta.env.VITE_AI_API_URL || "";
const ZHIPU_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const STORAGE_KEY = "recruit-match-zhipu-key";

export function getStoredAiKey() {
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function storeAiKey(value) {
  const key = String(value || "").trim();
  if (key) window.localStorage.setItem(STORAGE_KEY, key);
  else window.localStorage.removeItem(STORAGE_KEY);
  return key;
}

export function isAiEnabled(apiKey = "") {
  return Boolean(AI_API_URL || apiKey);
}

export function parseBossFileName(fileName) {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  const bracket = stem.match(/【([^】]+)】/);
  const suffix = stem.replace(/^.*】/, "").trim();
  const graduation = suffix.match(/(\d{2,4})\s*(?:年|届)?\s*应届生|(\d{2})\s*届/);
  const rawName = suffix
    .replace(/\d{2,4}\s*(?:年|届)?\s*应届生.*$/, "")
    .replace(/\d{2}\s*届.*$/, "")
    .replace(/(?:个人)?简历|附件|应聘|候选人/gi, "")
    .trim();
  const nameMatch = rawName.match(/[\u4e00-\u9fa5·]{2,6}/);
  const bracketParts = bracket?.[1]?.split("_") || [];
  const locationMatch = bracket?.[1]?.match(/(?:北京|上海|深圳|广州|杭州|成都|武汉|南京|西安|苏州)/);

  return {
    name: nameMatch?.[0] || "",
    graduationYear: normalizeGraduationYear(graduation?.[1] || graduation?.[2] || ""),
    targetRole: bracketParts[0] || "",
    location: locationMatch?.[0] || "",
  };
}

export async function parseResumeFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf" || file.type === "application/pdf") {
    return parsePdf(file);
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value.trim(), images: [] };
  }
  if (extension === "txt" || file.type.startsWith("text/")) {
    return { text: (await file.text()).trim(), images: [] };
  }
  throw new Error("暂不支持该文件格式，请上传 PDF、DOCX 或 TXT");
}

async function parsePdf(file) {
  const [pdfjsLib, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = Math.min(pdf.numPages, 12);
  const textParts = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    textParts.push(content.items.map((item) => item.str).join(" "));
  }

  const text = textParts.join("\n").replace(/\s{2,}/g, " ").trim();
  if (text.length >= 80) return { text, images: [] };

  const images = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.78));
  }
  return { text, images };
}

export async function parseResumeWithAi({ fileName, text, images, job, apiKey = "" }) {
  if (!AI_API_URL && !apiKey) throw new Error("AI_SERVICE_NOT_CONFIGURED");
  if (!AI_API_URL) {
    return parseDirectWithZhipu({ fileName, text, images, job, apiKey });
  }
  const response = await fetch(AI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName,
      text: text.slice(0, 42000),
      images: images.slice(0, 3),
      job: {
        title: job.title,
        location: job.location,
        jd: job.jd,
        persona: job.persona,
        keywords: job.keywords,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "智谱解析失败");
  return normalizeCandidate(payload.candidate, fileName, text);
}

async function parseDirectWithZhipu({ fileName, text, images, job, apiKey }) {
  const useVision = images.length > 0 && text.length < 80;
  const prompt = buildAiPrompt(fileName, text, job);
  const content = useVision
    ? [
        ...images.slice(0, 3).map((image) => ({
          type: "image_url",
          image_url: { url: image },
        })),
        { type: "text", text: prompt },
      ]
    : prompt;
  const requestBody = {
    model: useVision ? "glm-4.6v-flash" : "glm-4-flash-250414",
    messages: [
      {
        role: "system",
        content: "你是严谨的中文招聘简历解析器。只依据输入内容提取信息，不得猜测或补造。",
      },
      { role: "user", content },
    ],
    temperature: 0.1,
    stream: false,
  };
  let payload;
  try {
    payload = await requestZhipu(requestBody, apiKey, true);
  } catch (error) {
    if (!error.retryWithoutFormat) throw error;
    payload = await requestZhipu(requestBody, apiKey, false);
  }
  const raw = payload?.choices?.[0]?.message?.content || "";
  return normalizeCandidate(parseJsonContent(raw), fileName, text);
}

async function requestZhipu(requestBody, apiKey, useJsonMode) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 50000);
    try {
      const response = await fetch(ZHIPU_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...requestBody,
          ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;

      const code = String(payload?.error?.code || "");
      const message = payload?.error?.message || "";
      if (
        useJsonMode &&
        response.status === 400 &&
        ["1210", "1214", "1215"].includes(code)
      ) {
        const formatError = new Error(message || "当前模型不支持 JSON 模式");
        formatError.retryWithoutFormat = true;
        throw formatError;
      }

      const error = new Error(humanizeApiError(response.status, code, message));
      const retryable =
        [429, 500, 502, 503, 504].includes(response.status) ||
        ["1234", "1302", "1305"].includes(code);
      if (!retryable || attempt === 2) throw error;
      lastError = error;
    } catch (error) {
      if (error.retryWithoutFormat) throw error;
      if (attempt === 2) {
        if (error.name === "AbortError") {
          throw new Error("智谱响应超时，请稍后重试");
        }
        throw error;
      }
      lastError = error;
    } finally {
      window.clearTimeout(timer);
    }
    await delay(800 * 2 ** attempt);
  }
  throw lastError || new Error("智谱 API 调用失败");
}

export function parseResumeLocally({ fileName, text }) {
  const fileMeta = parseBossFileName(fileName);
  const degree = detectDegree(text);
  const name = detectName(text) || fileMeta.name || "姓名待确认";
  const school = detectSchool(text);
  const graduationYear = detectGraduationYear(text) || fileMeta.graduationYear;
  const years = detectYears(text);
  const skills = SKILL_DICTIONARY.filter((skill) =>
    text.toLowerCase().includes(skill.toLowerCase()),
  );

  return normalizeCandidate(
    {
      name,
      degree,
      school,
      major: detectMajor(text),
      graduationYear,
      years,
      skills,
      summary: text.slice(0, 150) || "未提取到可读正文",
      experiences: extractLines(text, /实习|工作|负责|任职/),
      projects: extractLines(text, /项目|研究|比赛|课题/),
      confidence: text.length > 200 ? 72 : 48,
      pending: text.length > 80 ? [] : ["简历正文较少，需要人工确认"],
    },
    fileName,
    text,
  );
}

export function splitPastedResumes(value) {
  const normalized = value.trim();
  if (!normalized) return [];
  const explicit = normalized.split(/\n\s*(?:={3,}|-{3,}|#{3,})\s*\n/).filter(Boolean);
  if (explicit.length > 1) return explicit;
  return normalized
    .split(/(?=\n(?:姓名|候选人)[:：]\s*[\u4e00-\u9fa5·]{2,6})/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCandidate(candidate = {}, fileName, originalText) {
  const fileMeta = parseBossFileName(fileName);
  const contentName = String(candidate.name || "").trim();
  const nameConflict =
    fileMeta.name && contentName && fileMeta.name !== contentName && contentName !== "姓名待确认";
  return {
    name: contentName || fileMeta.name || "姓名待确认",
    degree: candidate.degree || "待确认",
    school: candidate.school || "学校待确认",
    major: candidate.major || "",
    graduationYear: candidate.graduationYear || fileMeta.graduationYear || "",
    years: Number.isFinite(Number(candidate.years)) ? Number(candidate.years) : 0,
    skills: unique(candidate.skills || []),
    summary: candidate.summary || "暂无摘要",
    experiences: unique(candidate.experiences || []),
    projects: unique(candidate.projects || []),
    pending: unique([
      ...(candidate.pending || []),
      ...(nameConflict ? [`文件名姓名“${fileMeta.name}”与正文姓名“${contentName}”不一致`] : []),
    ]),
    confidence: Math.max(0, Math.min(100, Number(candidate.confidence) || 60)),
    fileName,
    text: originalText,
    targetRole: fileMeta.targetRole,
    location: fileMeta.location,
  };
}

function buildAiPrompt(fileName, text, job = {}) {
  return `请将下面的候选人简历解析为严格 JSON。

文件名：${String(fileName || "").slice(0, 300)}
目标岗位：${String(job.title || "")}
岗位地点：${String(job.location || "")}
岗位关键词：${Array.isArray(job.keywords) ? job.keywords.join("、") : ""}

简历原文：
${String(text || "该文件为扫描件，请根据图片识别").slice(0, 42000)}

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
4. 文件名“【岗位_城市 薪资】姓名 28年应届生.pdf”应提取姓名和 2028 毕业年份。
5. 只返回 JSON，不要 Markdown。`;
}

function parseJsonContent(raw) {
  const source = Array.isArray(raw)
    ? raw.map((item) => item?.text || item?.content || "").join("")
    : raw;
  const cleaned = String(source)
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型返回内容不是有效 JSON");
  const jsonText = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return JSON.parse(jsonrepair(jsonText));
  }
}

function humanizeApiError(status, code, message) {
  if (status === 401 || code.startsWith("100")) {
    return "智谱 API Key 无效或已失效，请重新连接";
  }
  if (code === "1261") return "简历文本过长，请拆分后重试";
  if (code === "1304") return "今日免费调用额度已用完";
  if (["1302", "1305"].includes(code) || status === 429) {
    return "智谱当前繁忙或请求过快，已自动重试仍未成功";
  }
  if (status >= 500) return "智谱服务暂时异常，请稍后重试";
  return message || `智谱 API 调用失败（${status}）`;
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function detectName(text) {
  const head = text.slice(0, 240);
  const labeled = head.match(/(?:姓名|候选人)[:：\s]+([\u4e00-\u9fa5·]{2,6})/);
  if (labeled) return labeled[1];
  const line = head
    .split(/\n/)
    .map((item) => item.trim())
    .find((item) => /^[\u4e00-\u9fa5·]{2,4}$/.test(item));
  return line || "";
}

function detectDegree(text) {
  if (/博士|PhD/i.test(text)) return "博士";
  if (/硕士|研究生|Master/i.test(text)) return "硕士";
  if (/本科|学士|Bachelor/i.test(text)) return "本科";
  if (/大专|专科|高职/.test(text)) return "大专";
  if (/高中|中专/.test(text)) return "高中";
  return "待确认";
}

function detectSchool(text) {
  const match = text.match(/([\u4e00-\u9fa5]{2,16}(?:大学|学院|职业技术学院|专科学校))/);
  return match?.[1] || "学校待确认";
}

function detectMajor(text) {
  const match = text.match(/(?:专业|主修)[:：\s]*([\u4e00-\u9fa5A-Za-z]{2,14})/);
  return match?.[1] || "";
}

function detectGraduationYear(text) {
  const match = text.match(/(?:毕业|应届|届)[:：\s]*(20\d{2})|20(\d{2})\s*届/);
  return match?.[1] || (match?.[2] ? `20${match[2]}` : "");
}

function normalizeGraduationYear(value) {
  if (!value) return "";
  return value.length === 2 ? `20${value}` : value;
}

function detectYears(text) {
  const yearMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*年(?:工作|实习|经验)?/g)];
  if (yearMatches.length) return Math.max(...yearMatches.map((item) => Number(item[1])));
  const monthMatches = [...text.matchAll(/(\d+)\s*个?月(?:工作|实习|经验)?/g)];
  if (monthMatches.length) return Math.max(...monthMatches.map((item) => Number(item[1]) / 12));
  return 0;
}

function extractLines(text, matcher) {
  return text
    .split(/[\n。]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && matcher.test(item))
    .slice(0, 4);
}

function unique(items) {
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}
