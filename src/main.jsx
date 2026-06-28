import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowDownToLine,
  BriefcaseBusiness,
  Check,
  Clipboard,
  FileText,
  Filter,
  GraduationCap,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import './styles.css';

const baseQuestions = [
  '候选人最快到岗时间是多久？',
  '每周可以稳定实习几天？',
  '可接受的整体实习时长为多久？',
  '在岗位base工作地点是否有稳定住所？',
];

const seedJobs = [
  {
    id: 'job-1',
    title: '增长运营实习生',
    department: '用户增长部',
    location: '上海',
    updatedAt: '今天 10:20',
    jd:
      '负责活动策划、用户分层运营、社群增长、数据复盘；需要熟悉 Excel/SQL/数据分析，具备内容运营或校园推广经验。',
    persona:
      '本科及以上，沟通推进强，对增长指标敏感，有互联网运营实习、社群运营、数据分析经验优先。',
    keywords: ['活动策划', '用户增长', '数据分析', '社群运营', 'Excel', 'SQL', '内容运营'],
  },
  {
    id: 'job-2',
    title: 'AI 产品经理实习生',
    department: '智能产品组',
    location: '北京',
    updatedAt: '昨天 18:42',
    jd:
      '协助 AI 产品需求调研、竞品分析、原型设计、模型效果评估和上线复盘，需要有产品思维、文档能力和 AI 工具使用经验。',
    persona:
      '本科及以上，逻辑清晰，熟悉大模型产品，有 Figma/Axure、PRD、用户访谈或数据分析经历优先。',
    keywords: ['AI', '产品经理', '竞品分析', '原型设计', 'PRD', 'Figma', '用户访谈'],
  },
  {
    id: 'job-3',
    title: '商业分析实习生',
    department: '战略与经营',
    location: '深圳',
    updatedAt: '06-24 14:05',
    jd:
      '支持行业研究、经营指标分析、专题分析和汇报材料制作，需要较强逻辑、Excel 建模、SQL 或 Python 数据处理能力。',
    persona:
      '本科及以上，商科/统计/计算机背景优先，有咨询、券商、互联网分析项目经验加分。',
    keywords: ['行业研究', '商业分析', 'Excel', 'SQL', 'Python', '建模', '汇报'],
  },
];

const seedResumes = {
  'job-1': [
    makeCandidate('cand-1', '林芷晴', '本科', '复旦大学', '活动策划 用户增长 社群运营 Excel 数据复盘 内容运营 校园推广', 'resume-lin.pdf', 0),
    makeCandidate('cand-2', '周亦辰', '硕士', '上海交通大学', 'SQL Python 数据分析 用户分层 增长实验 AB测试', 'resume-zhou.pdf', 1),
    makeCandidate('cand-3', '许嘉宁', '大专', '上海出版印刷高等专科学校', '新媒体 内容排版 社群维护 活动执行', 'resume-xu.pdf', 2),
  ],
  'job-2': [
    makeCandidate('cand-4', '陈一诺', '本科', '浙江大学', 'AI 产品经理 竞品分析 PRD Figma 用户访谈 大模型工具', 'resume-chen.pdf', 0),
    makeCandidate('cand-5', '何若川', '本科', '同济大学', '原型设计 Axure 数据分析 项目管理 智能客服', 'resume-he.pdf', 1),
  ],
  'job-3': [
    makeCandidate('cand-6', '沈知微', '硕士', '香港中文大学', '商业分析 行业研究 Excel SQL Python 咨询 实习 汇报材料', 'resume-shen.pdf', 0),
  ],
};

function makeCandidate(id, name, degree, school, text, fileName, index) {
  return {
    id,
    name,
    degree,
    school,
    text,
    fileName,
    createdAt: index === 0 ? '刚刚' : `${index + 1}小时前`,
  };
}

function readFileText(file) {
  return new Promise((resolve) => {
    if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsText(file);
      return;
    }
    resolve('');
  });
}

function detectName(fileName, index) {
  const clean = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  const zh = clean.match(/[\u4e00-\u9fa5]{2,4}/);
  if (zh) return zh[0];
  return `候选人${index + 1}`;
}

function detectDegree(text) {
  if (/博士/.test(text)) return '博士';
  if (/硕士|研究生/.test(text)) return '硕士';
  if (/本科|学士|大学/.test(text)) return '本科';
  if (/大专|专科|高职/.test(text)) return '大专';
  return '待核实';
}

function isDegreeQualified(degree) {
  return ['本科', '硕士', '博士'].includes(degree);
}

function scoreCandidate(job, candidate) {
  const haystack = `${candidate.text} ${candidate.fileName} ${candidate.school} ${candidate.degree}`.toLowerCase();
  const keywords = job.keywords.length ? job.keywords : extractKeywords(`${job.jd} ${job.persona}`);
  const matched = keywords.filter((word) => haystack.includes(word.toLowerCase()));
  const missing = keywords.filter((word) => !haystack.includes(word.toLowerCase()));
  const hardPass = isDegreeQualified(candidate.degree);
  const coreRatio = keywords.length ? matched.length / keywords.length : 0;
  const jdBonus = /实习|项目|运营|产品|分析|研究|推广|模型|原型/i.test(haystack) ? 9 : 3;
  const baseBonus = hardPass ? 14 : -22;
  const score = Math.max(18, Math.min(99, Math.round(36 + coreRatio * 44 + jdBonus + baseBonus)));
  const advantage = matched.slice(0, 4).map((item) => `简历体现「${item}」，与岗位核心画像匹配`);
  if (/复盘|ab|指标|建模|用户访谈|咨询|校园推广/i.test(haystack)) {
    advantage.push('存在可迁移项目经历，可作为业务面试加分点');
  }
  const gaps = missing.slice(0, 4).map((item) => `未明确体现「${item}」经验`);
  if (!hardPass) gaps.unshift('学历未满足本科及以上硬性门槛');
  if (candidate.degree === '待核实') gaps.unshift('学历信息缺失，需要人工确认');
  const customQuestions = buildCustomQuestions(job, missing, candidate);
  return {
    score,
    hardPass,
    matched,
    missing,
    advantage: advantage.length ? advantage : ['简历存在相关经历，但关键成果描述仍需进一步核实'],
    gaps: gaps.length ? gaps : ['暂无明显短板，建议在面试中核实成果真实性'],
    questions: [...baseQuestions, ...customQuestions],
  };
}

function buildCustomQuestions(job, missing, candidate) {
  const questions = missing.slice(0, 4).map((item) => `请补充说明你在「${item}」方面的具体经历、产出或数据结果。`);
  if (!/实习|项目|工作/.test(candidate.text)) {
    questions.push('简历中项目/实习经历描述较少，是否可以补充一个最能证明岗位能力的案例？');
  }
  if (!/上海|北京|深圳|广州|杭州|成都/.test(candidate.text)) {
    questions.push(`是否可以长期在${job.location}线下实习？通勤安排是否稳定？`);
  }
  if (candidate.degree === '待核实') {
    questions.push('请确认当前最高学历、学校、专业和预计毕业时间。');
  }
  return [...new Set(questions)].slice(0, 6);
}

function extractKeywords(text) {
  return [...new Set((text.match(/[A-Za-z+#]+|[\u4e00-\u9fa5]{2,6}/g) || []).filter((word) => word.length > 1))].slice(0, 10);
}

function App() {
  const [jobs, setJobs] = useState(seedJobs);
  const [activeJobId, setActiveJobId] = useState(seedJobs[0].id);
  const [resumesByJob, setResumesByJob] = useState(seedResumes);
  const [selectedCandidateId, setSelectedCandidateId] = useState('cand-1');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');

  const activeJob = jobs.find((job) => job.id === activeJobId) || jobs[0];
  const candidates = resumesByJob[activeJob.id] || [];

  const ranked = useMemo(() => {
    return candidates
      .map((candidate) => ({ ...candidate, match: scoreCandidate(activeJob, candidate) }))
      .sort((a, b) => {
        if (a.match.hardPass !== b.match.hardPass) return Number(b.match.hardPass) - Number(a.match.hardPass);
        return b.match.score - a.match.score;
      })
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }, [activeJob, candidates]);

  const filtered = ranked.filter((item) => `${item.name}${item.school}${item.fileName}`.toLowerCase().includes(query.toLowerCase()));
  const selected = ranked.find((item) => item.id === selectedCandidateId) || ranked[0];

  useEffect(() => {
    if (!ranked.find((item) => item.id === selectedCandidateId)) {
      setSelectedCandidateId(ranked[0]?.id || '');
    }
  }, [ranked, selectedCandidateId]);

  function updateJob(field, value) {
    setJobs((list) =>
      list.map((job) =>
        job.id === activeJob.id
          ? { ...job, [field]: value, keywords: field === 'jd' || field === 'persona' ? extractKeywords(`${field === 'jd' ? value : job.jd} ${field === 'persona' ? value : job.persona}`) : job.keywords, updatedAt: '刚刚' }
          : job,
      ),
    );
  }

  function addJob() {
    const id = `job-${Date.now()}`;
    const job = {
      id,
      title: '新建实习岗位',
      department: '待填写部门',
      location: '上海',
      updatedAt: '刚刚',
      jd: '请填写岗位职责、任职要求、工作地点和实习周期。',
      persona: '请填写核心人才画像，例如专业背景、关键技能、项目经验、软性能力。',
      keywords: ['岗位职责', '关键技能', '项目经验'],
    };
    setJobs((list) => [job, ...list]);
    setResumesByJob((map) => ({ ...map, [id]: [] }));
    setActiveJobId(id);
    setSelectedCandidateId('');
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const parsed = await Promise.all(
      files.map(async (file, index) => {
        const text = await readFileText(file);
        const fallback = `${file.name} ${activeJob.keywords.slice(0, index % 3 === 0 ? 5 : 3).join(' ')} 实习 项目 复盘`;
        return makeCandidate(`cand-${Date.now()}-${index}`, detectName(file.name, index), detectDegree(`${file.name} ${text}`), '简历待解析', text || fallback, file.name, 0);
      }),
    );
    setResumesByJob((map) => ({ ...map, [activeJob.id]: [...(map[activeJob.id] || []), ...parsed] }));
    setSelectedCandidateId(parsed[0].id);
    event.target.value = '';
    flash(`已录入 ${files.length} 份简历，排名已刷新`);
  }

  function flash(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }

  function copySummary() {
    const lines = ranked.map((item) => `${item.rank}. ${item.name}｜${item.match.score}分｜${item.match.hardPass ? '本科及以上达标' : '硬性条件未达标'}｜${item.match.advantage.slice(0, 2).join('；')}`);
    navigator.clipboard?.writeText(`${activeJob.title}候选人排名\n${lines.join('\n')}`);
    flash('已复制排名摘要');
  }

  function exportCsv() {
    const csv = ['排名,姓名,分数,学历达标,学校,文件,匹配亮点,短板']
      .concat(ranked.map((item) => [item.rank, item.name, item.match.score, item.match.hardPass ? '达标' : '未达标', item.school, item.fileName, item.match.advantage.join('；'), item.match.gaps.join('；')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeJob.title}-候选人排名.csv`;
    link.click();
    URL.revokeObjectURL(url);
    flash('已导出 CSV');
  }

  const averageScore = ranked.length ? Math.round(ranked.reduce((sum, item) => sum + item.match.score, 0) / ranked.length) : 0;
  const passCount = ranked.filter((item) => item.match.hardPass).length;

  return (
    <div className="app">
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BriefcaseBusiness size={20} /></div>
          <div>
            <h1>招聘匹配系统</h1>
            <p>实习岗位初筛工作台</p>
          </div>
        </div>

        <button className="primary-action" onClick={addJob}><Plus size={16} />新建岗位</button>

        <div className="side-section">
          <div className="section-title">岗位库</div>
          <div className="job-list">
            {jobs.map((job) => (
              <button
                key={job.id}
                className={`job-item ${job.id === activeJob.id ? 'active' : ''}`}
                onClick={() => setActiveJobId(job.id)}
              >
                <span>{job.title}</span>
                <small>{job.department} · {resumesByJob[job.id]?.length || 0} 人</small>
              </button>
            ))}
          </div>
        </div>

        <div className="rule-box">
          <ShieldCheck size={18} />
          <div>
            <strong>固定硬性规则</strong>
            <p>学历要求本科及以上；未满足自动降级排名并重点标注。</p>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <input className="job-title-input" value={activeJob.title} onChange={(e) => updateJob('title', e.target.value)} />
            <div className="meta-line">{activeJob.department} · Base {activeJob.location} · 更新 {activeJob.updatedAt}</div>
          </div>
          <div className="top-actions">
            <button onClick={() => flash('岗位信息已刷新，全量候选人已重算')}><RefreshCw size={16} />更新JD</button>
            <button onClick={copySummary}><Clipboard size={16} />复制给业务</button>
            <button onClick={exportCsv}><ArrowDownToLine size={16} />导出</button>
          </div>
        </header>

        <section className="summary-grid">
          <Metric label="候选人总数" value={ranked.length} helper="岗位独立人才库" />
          <Metric label="平均匹配分" value={averageScore || '-'} helper="新增/更新后自动重算" />
          <Metric label="硬性达标" value={`${passCount}/${ranked.length || 0}`} helper="本科及以上" />
          <Metric label="高匹配候选人" value={ranked.filter((item) => item.match.score >= 80 && item.match.hardPass).length} helper="80分及以上" />
        </section>

        <section className="content-grid">
          <div className="left-flow">
            <section className="panel jd-panel">
              <div className="panel-head">
                <div>
                  <h2>岗位JD与核心画像</h2>
                  <p>修改后自动刷新当前岗位下全部简历分数与排名</p>
                </div>
              </div>
              <label>岗位职责 / 任职要求</label>
              <textarea value={activeJob.jd} onChange={(e) => updateJob('jd', e.target.value)} />
              <label>核心人才画像</label>
              <textarea value={activeJob.persona} onChange={(e) => updateJob('persona', e.target.value)} />
              <div className="keyword-row">
                {activeJob.keywords.slice(0, 8).map((word) => <span key={word}>{word}</span>)}
              </div>
            </section>

            <section className="panel upload-panel">
              <div className="upload-copy">
                <h2>上传简历</h2>
                <p>支持单份或批量上传，自动纳入当前岗位排名库。</p>
              </div>
              <label className="dropzone">
                <UploadCloud size={26} />
                <span>选择简历文件</span>
                <small>PDF / Word / TXT 均可；TXT 可读取正文，其它格式按文件名和岗位关键词模拟解析</small>
                <input type="file" multiple onChange={handleUpload} />
              </label>
            </section>

            <section className="panel table-panel">
              <div className="panel-head">
                <div>
                  <h2>候选人排名榜单</h2>
                  <p>核心画像匹配优先，其次JD要求与基础信息</p>
                </div>
                <div className="searchbox"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名/学校/文件" /></div>
              </div>
              <div className="table">
                <div className="table-row table-head">
                  <span>排名</span><span>候选人</span><span>分数</span><span>硬性条件</span><span>核心匹配</span>
                </div>
                {filtered.map((item) => (
                  <button key={item.id} className={`table-row ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedCandidateId(item.id)}>
                    <span className="rank">#{item.rank}</span>
                    <span className="person"><UserRound size={16} /><b>{item.name}</b><small>{item.school}</small></span>
                    <span><Score value={item.match.score} /></span>
                    <span className={item.match.hardPass ? 'status pass' : 'status fail'}>{item.match.hardPass ? '达标' : '未达标'}</span>
                    <span className="match-tags">{item.match.matched.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}</span>
                  </button>
                ))}
                {!filtered.length && <div className="empty">暂无候选人，请上传简历。</div>}
              </div>
            </section>
          </div>

          <aside className="detail-panel">
            {selected ? (
              <>
                <div className="candidate-head">
                  <div>
                    <div className="avatar">{selected.name.slice(0, 1)}</div>
                    <h2>{selected.name}</h2>
                    <p>{selected.fileName}</p>
                  </div>
                  <Score value={selected.match.score} large />
                </div>

                <div className={`hard-rule ${selected.match.hardPass ? 'ok' : 'warn'}`}>
                  {selected.match.hardPass ? <GraduationCap size={18} /> : <AlertTriangle size={18} />}
                  <span>{selected.match.hardPass ? `${selected.degree}，满足本科及以上` : `${selected.degree}，不符合/待核实硬性条件`}</span>
                </div>

                <InfoBlock title="核心匹配亮点" items={selected.match.advantage} tone="good" />
                <InfoBlock title="未匹配短板" items={selected.match.gaps} tone="risk" />

                <div className="question-block">
                  <div className="block-title"><MessageSquareText size={17} />待沟通问题</div>
                  {selected.match.questions.map((question, index) => (
                    <div className="question" key={question}>
                      <span>{index + 1}</span>
                      <p>{question}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-detail">
                <FileText size={32} />
                <p>选择候选人后查看匹配详情</p>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, helper }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function Score({ value, large = false }) {
  return (
    <div className={`score ${large ? 'large' : ''}`}>
      <strong>{value}</strong>
      <small>分</small>
    </div>
  );
}

function InfoBlock({ title, items, tone }) {
  return (
    <div className={`info-block ${tone}`}>
      <div className="block-title">{tone === 'good' ? <Check size={17} /> : <X size={17} />}{title}</div>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
