import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  ArrowDownToLine,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  FileText,
  Filter,
  GraduationCap,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { baseQuestions, seedJobs, seedResumes } from "./data";
import {
  getStoredAiKey,
  isAiEnabled,
  parseResumeFile,
  parseResumeLocally,
  parseResumeWithAi,
  splitPastedResumes,
  storeAiKey,
} from "./resumeParser";
import "./styles.css";

const DEGREE_LEVELS = {
  高中: 1,
  大专: 2,
  本科: 3,
  硕士: 4,
  博士: 5,
};

const DEGREE_OPTIONS = [
  { value: "不限", label: "不限" },
  { value: "大专", label: "大专及以上" },
  { value: "本科", label: "本科及以上" },
  { value: "硕士", label: "硕士及以上" },
];

const SYNONYMS = {
  数据分析: ["数据处理", "统计分析", "数据洞察", "数据治理"],
  Excel: ["数据透视表", "VLOOKUP", "Power Query", "表格"],
  内容运营: ["公众号运营", "新媒体运营", "内容策划"],
  SQL: ["MySQL", "PostgreSQL", "数据库查询"],
  排班: ["排期", "班次", "调度", "值班"],
  沟通: ["协调", "跨团队", "推进", "对接"],
};

const DEFAULT_FILTERS = {
  degree: "本科",
  minYears: 0,
  keywords: ["Excel", "排班", "数据分析"],
  matchMode: "any",
};

function educationState(degree, minimum) {
  if (minimum === "不限") return "pass";
  if (!DEGREE_LEVELS[degree]) return "pending";
  return DEGREE_LEVELS[degree] >= DEGREE_LEVELS[minimum] ? "pass" : "fail";
}

function keywordMatches(text, keyword) {
  const normalized = text.toLowerCase();
  const variants = [keyword, ...(SYNONYMS[keyword] || [])];
  return variants.some((item) => normalized.includes(item.toLowerCase()));
}

function scoreCandidate(job, candidate, filters) {
  const haystack = [
    candidate.text,
    candidate.summary,
    candidate.school,
    candidate.major,
    candidate.skills?.join(" "),
    candidate.experiences?.join(" "),
    candidate.projects?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const keywords = filters.keywords.length ? filters.keywords : job.keywords;
  const matched = keywords.filter((word) => keywordMatches(haystack, word));
  const missing = keywords.filter((word) => !keywordMatches(haystack, word));
  const education = educationState(candidate.degree, filters.degree);
  const degreeScore = education === "pass" ? 25 : education === "pending" ? 12 : 0;
  const years = Number(candidate.years) || 0;
  const yearsScore =
    filters.minYears === 0
      ? 20
      : Math.min(20, Math.round((years / filters.minYears) * 20));
  const skillRatio = keywords.length ? matched.length / keywords.length : 1;
  const skillScore = Math.round(skillRatio * 35);
  const experienceText = `${candidate.experiences?.join(" ")} ${candidate.projects?.join(" ")}`;
  const relatedExperience = keywords.filter((word) => keywordMatches(experienceText, word)).length;
  const experienceScore = Math.min(15, 5 + relatedExperience * 3);
  const bonusScore =
    candidate.projects?.length > 0 || /奖|负责|提升|降低|准确率|覆盖/.test(haystack) ? 5 : 2;
  const modePenalty =
    filters.matchMode === "all" && missing.length > 0 ? Math.min(12, missing.length * 3) : 0;
  const score = Math.max(
    0,
    Math.min(100, degreeScore + yearsScore + skillScore + experienceScore + bonusScore - modePenalty),
  );
  const advantage = matched.slice(0, 5).map((item) => `简历明确体现「${item}」，与当前筛选条件匹配`);
  if (candidate.projects?.length) {
    advantage.push("存在可进一步核实的相关项目经历");
  }
  const gaps = missing.slice(0, 5).map((item) => `未明确体现「${item}」经验`);
  if (filters.minYears > years) {
    gaps.push(`相关年限约 ${formatYears(years)}，低于设定的 ${formatYears(filters.minYears)}`);
  }
  if (education === "fail") {
    gaps.unshift(`最高学历为${candidate.degree}，未满足${filters.degree}及以上条件`);
  }
  const pending = [...(candidate.pending || [])];
  if (education === "pending") pending.unshift("学历信息未识别，需人工确认，当前不按不达标处理");
  if (!candidate.graduationYear) pending.push("毕业年份未明确");
  const questions = [
    ...baseQuestions,
    ...missing.slice(0, 3).map((item) => `请补充说明你在「${item}」方面的具体经历和结果。`),
    ...pending.slice(0, 2).map((item) => `请确认：${item}`),
  ];

  return {
    score,
    education,
    matched,
    missing,
    advantage: advantage.length ? advantage : ["基础信息已录入，核心岗位能力仍需进一步核实"],
    gaps: gaps.length ? gaps : ["暂无明显短板，建议面试核实成果真实性"],
    pending: [...new Set(pending)],
    questions: [...new Set(questions)],
    breakdown: [
      { label: "学历", value: degreeScore, max: 25 },
      { label: "年限", value: yearsScore, max: 20 },
      { label: "技能", value: skillScore, max: 35 },
      { label: "经历", value: experienceScore, max: 15 },
      { label: "加分", value: bonusScore, max: 5 },
    ],
  };
}

function App() {
  const [jobs, setJobs] = useState(seedJobs);
  const [activeJobId, setActiveJobId] = useState(seedJobs[0].id);
  const [resumesByJob, setResumesByJob] = useState(seedResumes);
  const [selectedCandidateId, setSelectedCandidateId] = useState("sample-1");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [inputMode, setInputMode] = useState("upload");
  const [toast, setToast] = useState("");
  const [isParsingPaste, setIsParsingPaste] = useState(false);
  const [apiKey, setApiKey] = useState(() => getStoredAiKey());
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiModal, setShowApiModal] = useState(false);
  const toastTimer = useRef(null);

  const activeJob = jobs.find((job) => job.id === activeJobId) || jobs[0];
  const candidates = resumesByJob[activeJob.id] || [];
  const aiEnabled = isAiEnabled(apiKey);

  const ranked = useMemo(() => {
    const statusPriority = { pass: 2, pending: 1, fail: 0 };
    return candidates
      .map((candidate) => ({
        ...candidate,
        match: scoreCandidate(activeJob, candidate, filters),
      }))
      .sort((a, b) => {
        const statusDiff =
          statusPriority[b.match.education] - statusPriority[a.match.education];
        if (statusDiff !== 0) return statusDiff;
        if (b.match.score !== a.match.score) return b.match.score - a.match.score;
        return b.match.matched.length - a.match.matched.length;
      })
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }, [activeJob, candidates, filters]);

  const filtered = ranked.filter((item) =>
    `${item.name}${item.school}${item.fileName}${item.skills?.join("")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected =
    ranked.find((item) => item.id === selectedCandidateId) || ranked[0];

  useEffect(() => {
    if (!ranked.some((item) => item.id === selectedCandidateId)) {
      setSelectedCandidateId(ranked[0]?.id || "");
    }
  }, [ranked, selectedCandidateId]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  function flash(message) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }

  function updateJob(field, value) {
    setJobs((list) =>
      list.map((job) =>
        job.id === activeJob.id
          ? { ...job, [field]: value, updatedAt: "刚刚" }
          : job,
      ),
    );
  }

  function addJob() {
    const id = `job-${Date.now()}`;
    const job = {
      id,
      title: "新建实习岗位",
      department: "待填写部门",
      location: "北京",
      updatedAt: "刚刚",
      jd: "请填写岗位职责、任职要求、工作地点和实习周期。",
      persona: "请填写学历、关键技能、相关经历和软性能力。",
      keywords: ["Excel", "沟通", "数据分析"],
    };
    setJobs((list) => [job, ...list]);
    setResumesByJob((map) => ({ ...map, [id]: [] }));
    setActiveJobId(id);
    setSelectedCandidateId("");
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const placeholders = files.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      name: "正在识别",
      degree: "待确认",
      school: "解析中",
      major: "",
      graduationYear: "",
      years: 0,
      skills: [],
      summary: "正在读取简历内容…",
      experiences: [],
      projects: [],
      pending: [],
      confidence: 0,
      fileName: file.name,
      text: "",
      source: "上传",
      parseStatus: "parsing",
      createdAt: "刚刚",
    }));
    setResumesByJob((map) => ({
      ...map,
      [activeJob.id]: [...(map[activeJob.id] || []), ...placeholders],
    }));
    setSelectedCandidateId(placeholders[0].id);

    for (const [index, file] of files.entries()) {
        const id = placeholders[index].id;
        try {
          const extracted = await parseResumeFile(file);
          const local = parseResumeLocally({
            fileName: file.name,
            text: extracted.text,
          });
          let parsed = local;
          let parseStatus = "review";
          if (aiEnabled) {
            try {
              parsed = await parseResumeWithAi({
                fileName: file.name,
                text: extracted.text,
                images: extracted.images,
                job: activeJob,
                apiKey,
              });
              parseStatus = "success";
            } catch (error) {
              parsed = {
                ...local,
                pending: [
                  ...(local.pending || []),
                  `AI 识别未完成：${error.message}`,
                ],
              };
            }
          }
          replaceCandidate(activeJob.id, id, {
            ...parsed,
            id,
            source: "上传",
            parseStatus,
            createdAt: "刚刚",
            _images: extracted.images,
          });
        } catch (error) {
          replaceCandidate(activeJob.id, id, {
            ...placeholders[index],
            name: "解析失败",
            school: "请重新上传或粘贴文本",
            summary: error.message,
            pending: [error.message],
            parseStatus: "error",
          });
        }
    }
    flash(`已处理 ${files.length} 份简历，排名已刷新`);
  }

  async function handlePasteParse() {
    const blocks = splitPastedResumes(pasteText).slice(0, 20);
    if (!blocks.length) {
      flash("请先粘贴简历文本");
      return;
    }
    setIsParsingPaste(true);
    const parsed = [];
    for (const [index, text] of blocks.entries()) {
        const fileName = `粘贴简历-${index + 1}.txt`;
        const local = parseResumeLocally({ fileName, text });
        if (!aiEnabled) {
          parsed.push({ ...local, _parseStatus: "review" });
          continue;
        }
        try {
          parsed.push(
            {
              ...(await parseResumeWithAi({
                fileName,
                text,
                images: [],
                job: activeJob,
                apiKey,
              })),
              _parseStatus: "success",
            },
          );
        } catch (error) {
          parsed.push({
            ...local,
            pending: [
              ...(local.pending || []),
              `AI 识别未完成：${error.message}`,
            ],
            _parseStatus: "review",
          });
        }
    }
    const now = Date.now();
    const candidatesToAdd = parsed.map((candidate, index) => ({
      ...candidate,
      id: `paste-${now}-${index}`,
      source: "粘贴",
      parseStatus: candidate._parseStatus || "review",
      createdAt: "刚刚",
    }));
    setResumesByJob((map) => ({
      ...map,
      [activeJob.id]: [...(map[activeJob.id] || []), ...candidatesToAdd],
    }));
    setSelectedCandidateId(candidatesToAdd[0].id);
    setPasteText("");
    setIsParsingPaste(false);
    flash(`已识别 ${candidatesToAdd.length} 份粘贴简历`);
  }

  function replaceCandidate(jobId, id, next) {
    setResumesByJob((map) => ({
      ...map,
      [jobId]: (map[jobId] || []).map((item) => (item.id === id ? next : item)),
    }));
  }

  function addKeyword() {
    const values = keywordDraft
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!values.length) return;
    setFilters((current) => ({
      ...current,
      keywords: [...new Set([...current.keywords, ...values])],
    }));
    setKeywordDraft("");
  }

  function removeKeyword(keyword) {
    setFilters((current) => ({
      ...current,
      keywords: current.keywords.filter((item) => item !== keyword),
    }));
  }

  function saveApiKey() {
    const nextKey = storeAiKey(apiKeyDraft);
    if (!nextKey) {
      flash("请输入有效的智谱 API Key");
      return;
    }
    setApiKey(nextKey);
    setApiKeyDraft("");
    setShowApiModal(false);
    flash("智谱 AI 已连接");
  }

  function disconnectAi() {
    storeAiKey("");
    setApiKey("");
    setApiKeyDraft("");
    setShowApiModal(false);
    flash("已移除本浏览器中的智谱 Key");
  }

  async function retryCandidate(candidate) {
    if (!aiEnabled) {
      setShowApiModal(true);
      flash("请先连接智谱 AI");
      return;
    }
    replaceCandidate(activeJob.id, candidate.id, {
      ...candidate,
      parseStatus: "parsing",
    });
    try {
      const parsed = await parseResumeWithAi({
        fileName: candidate.fileName,
        text: candidate.text || "",
        images: candidate._images || [],
        job: activeJob,
        apiKey,
      });
      replaceCandidate(activeJob.id, candidate.id, {
        ...parsed,
        id: candidate.id,
        source: candidate.source,
        parseStatus: "success",
        createdAt: "刚刚",
        _images: candidate._images || [],
      });
      flash(`${parsed.name} 已重新识别`);
    } catch (error) {
      replaceCandidate(activeJob.id, candidate.id, {
        ...candidate,
        parseStatus: "review",
        pending: [
          ...new Set([
            ...(candidate.pending || []),
            `AI 识别未完成：${error.message}`,
          ]),
        ],
      });
      flash(error.message);
    }
  }

  function copySummary() {
    const lines = ranked.map(
      (item) =>
        `${item.rank}. ${item.name}｜${item.match.score}分｜${educationLabel(item.match.education)}｜${item.match.matched.join("、") || "待核实"}`,
    );
    navigator.clipboard?.writeText(
      `${activeJob.title}候选人排名\n${lines.join("\n")}`,
    );
    flash("已复制排名摘要");
  }

  function exportCsv() {
    const csv = ["排名,姓名,分数,学历状态,学历,年限,技能,文件"]
      .concat(
        ranked.map((item) =>
          [
            item.rank,
            item.name,
            item.match.score,
            educationLabel(item.match.education),
            item.degree,
            formatYears(item.years),
            item.skills?.join("；"),
            item.fileName,
          ]
            .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
            .join(","),
        ),
      )
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeJob.title}-候选人排名.csv`;
    link.click();
    URL.revokeObjectURL(url);
    flash("已导出 CSV");
  }

  const averageScore = ranked.length
    ? Math.round(
        ranked.reduce((sum, item) => sum + item.match.score, 0) / ranked.length,
      )
    : 0;
  const passCount = ranked.filter((item) => item.match.education === "pass").length;
  const pendingCount = ranked.filter(
    (item) => item.match.education === "pending",
  ).length;

  return (
    <div className="app-shell">
      {toast ? (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      ) : null}
      {showApiModal ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="api-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-modal-title"
          >
            <div className="api-modal-head">
              <div>
                <h2 id="api-modal-title">连接智谱 AI</h2>
                <p>用于把简历正文整理成结构化候选人信息</p>
              </div>
              <button
                className="icon-button"
                aria-label="关闭"
                onClick={() => setShowApiModal(false)}
              >
                <X size={17} />
              </button>
            </div>
            <label htmlFor="zhipu-key">智谱 API Key</label>
            <div className="secret-input">
              <KeyRound size={16} />
              <input
                id="zhipu-key"
                type="password"
                autoComplete="off"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder="请输入 API Key"
              />
            </div>
            <p className="privacy-note">
              Key 仅保存在当前浏览器，并直接发送给智谱官方接口；不会写入 GitHub
              源码。
            </p>
            <div className="modal-actions">
              {apiKey ? (
                <button className="danger-button" onClick={disconnectAi}>
                  移除 Key
                </button>
              ) : (
                <span />
              )}
              <button className="solid-button" onClick={saveApiKey}>
                <Sparkles size={15} />
                保存并连接
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BriefcaseBusiness size={20} />
          </div>
          <div>
            <h1>简历匹配工作台</h1>
            <p>实习岗位智能初筛</p>
          </div>
        </div>
        <button className="primary-action" onClick={addJob}>
          <Plus size={16} />
          新建岗位
        </button>
        <div className="side-section">
          <div className="section-title">岗位库</div>
          <div className="job-list">
            {jobs.map((job) => (
              <button
                key={job.id}
                className={`job-item ${job.id === activeJob.id ? "active" : ""}`}
                onClick={() => setActiveJobId(job.id)}
              >
                <span>{job.title}</span>
                <small>
                  {job.location} · {resumesByJob[job.id]?.length || 0} 人
                </small>
              </button>
            ))}
          </div>
        </div>
        <div className="ai-status">
          <Bot size={17} />
          <div>
            <strong>{aiEnabled ? "智谱 AI 已接入" : "本地解析模式"}</strong>
            <p>
              {aiEnabled
                ? "文件正文由安全后端调用免费模型识别"
                : "未配置后端时仍可本地提取基础字段"}
            </p>
            <button
              onClick={() => {
                setApiKeyDraft("");
                setShowApiModal(true);
              }}
            >
              {aiEnabled ? "更换 Key" : "连接智谱"}
            </button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="job-heading">
            <input
              className="job-title-input"
              value={activeJob.title}
              onChange={(event) => updateJob("title", event.target.value)}
            />
            <p>
              {activeJob.department} · Base {activeJob.location} · 更新{" "}
              {activeJob.updatedAt}
            </p>
          </div>
          <div className="top-actions">
            <button onClick={() => flash("岗位条件已刷新，排名已重新计算")}>
              <RefreshCw size={15} />
              重算
            </button>
            <button onClick={copySummary}>
              <Clipboard size={15} />
              复制
            </button>
            <button onClick={exportCsv}>
              <ArrowDownToLine size={15} />
              导出
            </button>
          </div>
        </header>

        <section className="metric-strip">
          <Metric label="候选人" value={ranked.length} />
          <Metric label="平均分" value={averageScore || "-"} />
          <Metric label="学历达标" value={passCount} tone="good" />
          <Metric label="待确认" value={pendingCount} tone="pending" />
        </section>

        <section className="workbench">
          <div className="control-column scroll-column">
            <section className="panel input-panel">
              <div className="panel-title">
                <div>
                  <h2>简历录入</h2>
                  <p>上传文件或批量粘贴文本</p>
                </div>
                <Sparkles size={18} />
              </div>
              <div className="segmented">
                <button
                  className={inputMode === "upload" ? "active" : ""}
                  onClick={() => setInputMode("upload")}
                >
                  文件上传
                </button>
                <button
                  className={inputMode === "paste" ? "active" : ""}
                  onClick={() => setInputMode("paste")}
                >
                  粘贴文本
                </button>
              </div>
              {inputMode === "upload" ? (
                <label className="dropzone">
                  <UploadCloud size={24} />
                  <strong>选择或拖入简历</strong>
                  <span>PDF、DOCX、TXT，可批量上传</span>
                  <small>
                    数字 PDF 直接提取文字，扫描件自动转图片交给 AI 识别
                  </small>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    multiple
                    onChange={handleUpload}
                  />
                </label>
              ) : (
                <div className="paste-box">
                  <textarea
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder={"粘贴多份简历文本\n\n每份之间用 === 分隔"}
                  />
                  <button
                    className="solid-button"
                    disabled={isParsingPaste}
                    onClick={handlePasteParse}
                  >
                    {isParsingPaste ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    识别粘贴内容
                  </button>
                </div>
              )}
            </section>

            <section className="panel filter-panel">
              <div className="panel-title">
                <div>
                  <h2>筛选条件</h2>
                  <p>调整后立即重算排名</p>
                </div>
                <SlidersHorizontal size={18} />
              </div>

              <label className="field-label" htmlFor="degree-filter">
                最低学历
              </label>
              <div className="select-wrap">
                <select
                  id="degree-filter"
                  value={filters.degree}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      degree: event.target.value,
                    }))
                  }
                >
                  {DEGREE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>

              <div className="range-head">
                <label className="field-label" htmlFor="years-filter">
                  最低相关年限
                </label>
                <strong>
                  {filters.minYears === 0 ? "不限" : formatYears(filters.minYears)}
                </strong>
              </div>
              <input
                id="years-filter"
                className="range"
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={filters.minYears}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minYears: Number(event.target.value),
                  }))
                }
              />
              <div className="range-scale">
                <span>不限</span>
                <span>5年</span>
              </div>

              <label className="field-label" htmlFor="keyword-filter">
                技能关键词
              </label>
              <div className="keyword-input">
                <input
                  id="keyword-filter"
                  value={keywordDraft}
                  onChange={(event) => setKeywordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="输入后按回车"
                />
                <button aria-label="添加关键词" onClick={addKeyword}>
                  <Plus size={15} />
                </button>
              </div>
              <div className="filter-tags">
                {filters.keywords.map((keyword) => (
                  <span key={keyword}>
                    {keyword}
                    <button
                      aria-label={`删除${keyword}`}
                      onClick={() => removeKeyword(keyword)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <label className="field-label">关键词规则</label>
              <div className="segmented compact">
                <button
                  className={filters.matchMode === "any" ? "active" : ""}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      matchMode: "any",
                    }))
                  }
                >
                  满足任意
                </button>
                <button
                  className={filters.matchMode === "all" ? "active" : ""}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      matchMode: "all",
                    }))
                  }
                >
                  必须全部
                </button>
              </div>
            </section>

            <section className="rule-note">
              <ShieldCheck size={17} />
              <p>
                缺失学历会标记“待确认”，不会直接判定不达标；只有明确低于条件时才降级。
              </p>
            </section>
          </div>

          <section className="results-column panel">
            <div className="results-head">
              <div>
                <h2>候选人排序</h2>
                <p>按学历状态、匹配分和技能数量综合排序</p>
              </div>
              <div className="searchbox">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索姓名、学校或技能"
                />
              </div>
            </div>
            <div className="result-table">
              <div className="result-row result-header">
                <span>排名</span>
                <span>候选人</span>
                <span>年限</span>
                <span>学历</span>
                <span>匹配项</span>
                <span>分数</span>
              </div>
              <div className="result-list">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    className={`result-row ${
                      selected?.id === item.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedCandidateId(item.id)}
                  >
                    <span className="rank-number">{item.rank}</span>
                    <span className="candidate-cell">
                      <span className="mini-avatar">{item.name.slice(0, 1)}</span>
                      <span>
                        <b>{item.name}</b>
                        <small>{item.school}</small>
                        <ParseState status={item.parseStatus} />
                      </span>
                    </span>
                    <span>{formatYears(item.years)}</span>
                    <EducationStatus state={item.match.education} compact />
                    <span className="match-tags">
                      {item.match.matched.slice(0, 3).map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                      {item.match.matched.length === 0 ? (
                        <small>暂无</small>
                      ) : null}
                    </span>
                    <Score value={item.match.score} />
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <Filter size={24} />
                    <p>当前条件下没有候选人</p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <CandidateDetail candidate={selected} onRetry={retryCandidate} />
        </section>
      </main>
    </div>
  );
}

function CandidateDetail({ candidate, onRetry }) {
  if (!candidate) {
    return (
      <aside className="detail-panel panel empty-detail">
        <FileText size={32} />
        <p>选择候选人后查看完整解析结果</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel panel">
      <div className="candidate-head">
        <div className="candidate-title">
          <div className="avatar">{candidate.name.slice(0, 1)}</div>
          <div>
            <h2>{candidate.name}</h2>
            <p>{candidate.fileName}</p>
          </div>
        </div>
        <Score value={candidate.match.score} large />
      </div>

      <div className="detail-scroll">
        <div className="confidence-row">
          <ParseState status={candidate.parseStatus} />
          <div>
            <span>识别可信度 {candidate.confidence || 0}%</span>
            {["review", "error"].includes(candidate.parseStatus) &&
            (candidate.text || candidate._images?.length) ? (
              <button
                className="retry-button"
                onClick={() => onRetry(candidate)}
              >
                <RefreshCw size={11} />
                重新识别
              </button>
            ) : null}
          </div>
        </div>

        <EducationStatus
          state={candidate.match.education}
          degree={candidate.degree}
        />

        <div className="breakdown">
          {candidate.match.breakdown.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <b>
                {item.value}/{item.max}
              </b>
            </div>
          ))}
        </div>

        <InfoBlock
          title="核心匹配亮点"
          items={candidate.match.advantage}
          tone="good"
        />
        {candidate.match.pending.length ? (
          <InfoBlock
            title="待确认信息"
            items={candidate.match.pending}
            tone="pending"
          />
        ) : null}
        <InfoBlock
          title="未匹配短板"
          items={candidate.match.gaps}
          tone="risk"
        />

        <DetailSection title="技能标签">
          <div className="skill-cloud">
            {(candidate.skills || []).map((skill) => (
              <span
                className={
                  candidate.match.matched.some(
                    (item) => item.toLowerCase() === skill.toLowerCase(),
                  )
                    ? "matched"
                    : ""
                }
                key={skill}
              >
                {skill}
              </span>
            ))}
            {candidate.skills?.length ? null : <p>未识别到明确技能</p>}
          </div>
        </DetailSection>

        <DetailSection title="教育信息">
          <dl className="detail-list">
            <div>
              <dt>学校</dt>
              <dd>{candidate.school || "待确认"}</dd>
            </div>
            <div>
              <dt>学历</dt>
              <dd>{candidate.degree || "待确认"}</dd>
            </div>
            <div>
              <dt>专业</dt>
              <dd>{candidate.major || "待确认"}</dd>
            </div>
            <div>
              <dt>毕业年份</dt>
              <dd>{candidate.graduationYear || "待确认"}</dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="实习 / 工作经历">
          <BulletList items={candidate.experiences} empty="未识别到明确经历" />
        </DetailSection>

        <DetailSection title="项目经历">
          <BulletList items={candidate.projects} empty="未识别到明确项目" />
        </DetailSection>

        <div className="question-block">
          <div className="block-title">
            <MessageSquareText size={17} />
            待沟通问题
          </div>
          {candidate.match.questions.map((question, index) => (
            <div className="question" key={question}>
              <span>{index + 1}</span>
              <p>{question}</p>
            </div>
          ))}
        </div>

        <DetailSection title="原始简历文本">
          <div className="raw-text">
            <HighlightedText
              text={candidate.text || "未提取到可读正文"}
              keywords={candidate.match.matched}
            />
          </div>
        </DetailSection>
      </div>
    </aside>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Score({ value, large = false }) {
  return (
    <div className={`score ${large ? "large" : ""}`}>
      <strong>{value}</strong>
      <small>分</small>
    </div>
  );
}

function EducationStatus({ state, degree, compact = false }) {
  const config = {
    pass: {
      icon: CheckCircle2,
      title: compact ? "达标" : `${degree || "学历"}，满足筛选条件`,
    },
    pending: {
      icon: AlertCircle,
      title: compact ? "待确认" : "学历信息待确认，不直接判定不达标",
    },
    fail: {
      icon: X,
      title: compact ? "不达标" : `${degree || "当前学历"}，未满足筛选条件`,
    },
  }[state];
  const Icon = config.icon;
  return (
    <div className={`education-status ${state} ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 14 : 18} />
      <span>{config.title}</span>
    </div>
  );
}

function ParseState({ status }) {
  const state = {
    parsing: { label: "解析中", className: "parsing", icon: LoaderCircle },
    success: { label: "AI 已识别", className: "success", icon: Sparkles },
    review: { label: "待确认", className: "review", icon: AlertCircle },
    error: { label: "解析失败", className: "error", icon: AlertCircle },
    sample: { label: "示例数据", className: "sample", icon: FileText },
  }[status] || { label: "已录入", className: "sample", icon: FileText };
  const Icon = state.icon;
  return (
    <span className={`parse-state ${state.className}`}>
      <Icon className={status === "parsing" ? "spin" : ""} size={11} />
      {state.label}
    </span>
  );
}

function InfoBlock({ title, items, tone }) {
  const Icon = tone === "good" ? Check : tone === "pending" ? AlertCircle : X;
  return (
    <div className={`info-block ${tone}`}>
      <div className="block-title">
        <Icon size={17} />
        {title}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items = [], empty }) {
  if (!items.length) return <p className="muted-copy">{empty}</p>;
  return (
    <ul className="bullet-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function HighlightedText({ text, keywords }) {
  if (!keywords.length) return text;
  const escaped = keywords
    .filter(Boolean)
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!escaped) return text;
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    keywords.some((item) => item.toLowerCase() === part.toLowerCase()) ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
}

function educationLabel(state) {
  return state === "pass" ? "达标" : state === "pending" ? "待确认" : "不达标";
}

function formatYears(value) {
  const years = Number(value) || 0;
  if (years === 0) return "不足1年";
  if (years < 1) return `${Math.max(1, Math.round(years * 12))}个月`;
  return `${Number.isInteger(years) ? years : years.toFixed(1)}年`;
}

createRoot(document.getElementById("root")).render(<App />);
