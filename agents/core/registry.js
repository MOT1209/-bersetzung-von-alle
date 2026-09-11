// agents/core/registry.js — سجل الـ 300 وكيل (100 رئيسي × 2 فرعي)
//
// يُبنى آليًا من squads.js: كل فرقة فيها 5 وكلاء رئيسيين (T1..T5)، ولكل
// رئيسي وكيلان فرعيان (T?.1 و T?.2). معرّفات مستقرة: 'S1:T1' و 'S1:T1.1'.
// الوكلاء الـ 12 في النظام القديم هم قادة الفرق (oldId يحفظ الهوية القديمة)
// فتبقى سير العمل القديمة (translate-youtube…) تعمل بلا تعديل.
const { SQUADS } = require('./squads');

const AGENTS = {};
const SQUAD_MAP = {}; // S1..S20 → { meta, leaders: [ids], members: [ids] }

function shortId(squadId, t) { return `${squadId}:${t}`; }      // S1:T3
function subId(squadId, t, n) { return `${squadId}:${t}.${n}`; } // S1:T3.1

for (const squad of Object.values(SQUADS)) {
  const memberIds = [];
  const leaderIds = [];

  for (const [t, L] of Object.entries(squad.leaders)) {
    const id = shortId(squad.id, t);
    leaderIds.push(id);
    memberIds.push(id);

    AGENTS[id] = {
      id,
      squad: squad.id,
      name: L.nameEn,
      nameAr: L.name,
      icon: squad.icon,
      role: 'leader',
      oldId: L.oldId || undefined,        // هوية النظام القديم (A1.1…) إن وجدت
      mission: squad.mission,
      realTools: L.realTools || [],       // أدوات حقيقية تُنفَّذ محليًا
      tools: L.tools || [],               // قدرات مسجّلة (للعرض والتوثيق)
      skills: [...(L.skills || [])],      // مهارات (llm = استدعاء اختياري)
      subagents: [subId(squad.id, t, 1), subId(squad.id, t, 2)],
      leader: null,
    };

    // ── الوكيلان الفرعيان ──
    for (const n of [1, 2]) {
      const sid = subId(squad.id, t, n);
      memberIds.push(sid);
      AGENTS[sid] = {
        id: sid,
        squad: squad.id,
        name: `${L.nameEn} Sub-${n}`,
        nameAr: `مساعد ${L.name} ${n}`,
        icon: '🔹',
        role: 'sub',
        parent: id,
        leader: id,
        mission: squad.mission,
        realTools: n === 1 ? ['search_code'] : ['list_files'], // الفرعي الأول يبحث (نمط افتراضي) والثاني يستكشف البنية
        tools: L.tools || [],
        skills: (L.skills || []).includes('llm') ? n === 1 ? ['llm'] : [] : [],
      };
    }
  }

  SQUAD_MAP[squad.id] = { ...squad, leaders: leaderIds, members: memberIds };
}

// ═══════════════════════════════════════════════════════════
// الحرس المتجوّلون — يراقبون نطاقات ويتنبهون عند مخالفات
// ═══════════════════════════════════════════════════════════
const GUARDIANS = {
  G1: {
    id: 'G1', name: 'Security Guardian', nameAr: 'حارس الأمان', icon: '🛡️',
    description: 'يتنصّت على نتائج الفرق الأمنية ويتنبه عند أي ثغرة أو تسريب',
    monitors: ['S9', 'S5'], alertOn: ['agent-failed', 'secret-leak', 'vuln-found'],
  },
  G2: {
    id: 'G2', name: 'Quality Guardian', nameAr: 'حارس الجودة', icon: '🏆',
    description: 'يتحقق أن كل موجة خرجت خضراء: اختبارات، لِنْت، تغطية',
    monitors: ['S8', 'S19'], alertOn: ['test-failure', 'lint-failure', 'coverage-drop'],
  },
  G3: {
    id: 'G3', name: 'Metrics Guardian', nameAr: 'حارس المقاييس', icon: '📈',
    description: 'يجمع مقاييس التشغيل من الفرق ويكشف التراجع الأدائي',
    monitors: ['S11', 'S18', 'S6'], alertOn: ['api-slow', 'cache-miss-high', 'db-slow'],
  },
};

// ═══════════════════════════════════════════════════════════
// سير العمل — القديمة بمُعرّفاتها الأصلية (تعمل عبر mapping) + جديدة
// ═══════════════════════════════════════════════════════════
// mapping: هوية النظام القديم → معرّف الجديد (القائد صاحب oldId نفسه)
const LEGACY_MAP = {};
for (const a of Object.values(AGENTS)) if (a.oldId) LEGACY_MAP[a.oldId] = a.id;

const WORKFLOWS = {
  'translate-youtube': {
    name: 'ترجمة فيديو يوتيوب',
    waves: [
      { name: 'استخراج', agents: ['A2.1', 'A6.1'], mode: 'parallel' },
      { name: 'فحص المزوّدين', agents: ['A1.1'], mode: 'sequential' },
      { name: 'ترجمة + TTS', agents: ['A1.2', 'A5.2'], mode: 'parallel' },
      { name: 'عرض النتيجة', agents: ['A3.2', 'A6.2'], mode: 'parallel' },
      { name: 'فحص الجودة', agents: ['A7.1'], mode: 'sequential' },
    ],
  },
  'translate-article': {
    name: 'ترجمة مقال',
    waves: [
      { name: 'استخراج', agents: ['A2.2'], mode: 'sequential' },
      { name: 'ترجمة', agents: ['A1.1', 'A1.2'], mode: 'sequential' },
      { name: 'عرض', agents: ['A3.2'], mode: 'sequential' },
      { name: 'فحص', agents: ['A7.1'], mode: 'sequential' },
    ],
  },
  'dub-video': {
    name: 'دبلجة فيديو يوتيوب',
    waves: [
      { name: 'استخراج', agents: ['A2.1'], mode: 'sequential' },
      { name: 'ترجمة', agents: ['A1.1', 'A1.2'], mode: 'sequential' },
      { name: 'STT', agents: ['A5.2'], mode: 'sequential' },
      { name: 'TTS', agents: ['A5.2'], mode: 'sequential' },
      { name: 'دمج', agents: ['A5.1'], mode: 'sequential' },
      { name: 'فحص', agents: ['A7.1'], mode: 'sequential' },
    ],
  },
  'security-audit': {
    name: 'مسح أمني شامل',
    waves: [
      { name: 'فحص الثغرات', agents: ['A8.1'], mode: 'sequential' },
      { name: 'مراجعة المصادقة', agents: ['A8.2'], mode: 'sequential' },
      { name: 'مراجعة الكود', agents: ['A4.1', 'A4.2'], mode: 'parallel' },
      { name: 'تقرير', agents: ['A10.1'], mode: 'sequential' },
    ],
  },
  'deploy': {
    name: 'نشر التطبيق',
    waves: [
      { name: 'اختبارات', agents: ['A7.1', 'A7.2'], mode: 'parallel' },
      { name: 'أمان', agents: ['A8.1'], mode: 'sequential' },
      { name: 'أداء', agents: ['A11.1'], mode: 'sequential' },
      { name: 'بناء Docker', agents: ['A9.1'], mode: 'sequential' },
      { name: 'نشر', agents: ['A9.2'], mode: 'sequential' },
    ],
  },
  // ── سير عمل جديدة تستثمر الفرق الجديدة ──
  'full-audit': {
    name: 'فحص شامل لكل الفرق (20 فرقة)',
    waves: [
      { name: 'الفرق الترجمة والاستخراج', agents: ['S1', 'S2'], mode: 'parallel', squads: true },
      { name: 'الواجهة والتجربة', agents: ['S3', 'S4'], mode: 'parallel', squads: true },
      { name: 'الخادم والبيانات والوسائط', agents: ['S5', 'S6', 'S7'], mode: 'parallel', squads: true },
      { name: 'الجودة والأمان', agents: ['S8', 'S9'], mode: 'parallel', squads: true },
      { name: 'النشر والأداء والتوثيق', agents: ['S10', 'S11', 'S12'], mode: 'parallel', squads: true },
      { name: 'التكامل والفرق المتخصصة', agents: ['S13', 'S14', 'S15', 'S16'], mode: 'parallel', squads: true },
      { name: 'المشاريع والمراقبة والاختبار الذاتي', agents: ['S17', 'S18', 'S19'], mode: 'parallel', squads: true },
      { name: 'البحث والهندسة العكسية', agents: ['S20'], mode: 'sequential', squads: true },
    ],
  },
  'arabic-quality': {
    name: 'جودة العربية (تشكيل + إملاء + RTL)',
    waves: [
      { name: 'التشكيل والإملاء', agents: ['S15'], mode: 'sequential', squads: true },
      { name: 'مراجعة جودة الترجمة', agents: ['S1:T3'], mode: 'sequential' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// أدوات استعلام
// ═══════════════════════════════════════════════════════════
function getAgent(id) { return AGENTS[id] || null; }

function resolveAgentId(idOrLegacy) {
  if (AGENTS[idOrLegacy]) return idOrLegacy;
  if (LEGACY_MAP[idOrLegacy]) return LEGACY_MAP[idOrLegacy];
  return null;
}

function getSquad(squadId) { return SQUAD_MAP[squadId] || null; }

function listSquads() { return Object.values(SQUAD_MAP); }

function countAgents() {
  const main = Object.values(AGENTS).filter((a) => a.role === 'leader').length;
  const sub = Object.values(AGENTS).filter((a) => a.role === 'sub').length;
  return { total: main + sub, main, sub, squads: Object.keys(SQUAD_MAP).length };
}

module.exports = {
  AGENTS, SQUADS: SQUAD_MAP, GUARDIANS, WORKFLOWS, LEGACY_MAP,
  getAgent, resolveAgentId, getSquad, listSquads, countAgents,
};
