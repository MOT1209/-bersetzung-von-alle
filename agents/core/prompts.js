// agents/core/prompts.js — توليد prompts من بيانات السجل (بلا قوالب يدوية)
//
// كانت كل وكيل له قالب مكتوب يدويًا (24 قالبًا). مع 300 وكيل صار التوليد
// من البيانات هو الطريق الوحيد القابل للصيانة: كل prompt يُبنى من مهمة
// الفرقة + أدوات الوكيل الحقيقية + مهاراته + وضعه في الشجرة.
const { AGENTS, SQUADS, resolveAgentId } = require('./registry');

function generatePrompt(idOrLegacy, context = {}) {
  const id = resolveAgentId(idOrLegacy);
  const agent = AGENTS[id];
  if (!agent) return `أنت وكيل غير معروف (${idOrLegacy}).`;

  const squad = SQUADS[agent.squad];
  const isLeader = agent.role === 'leader';

  return [
    `أنت ${isLeader ? 'قائد' : 'وكيل فرعي'} في نظام وكلاء ترجِم.`,
    ``,
    `## هويتك`,
    `- المعرّف: ${agent.id}${agent.oldId ? ` (سابقًا ${agent.oldId} في النظام القديم)` : ''}`,
    `- الاسم: ${agent.nameAr}`,
    `- الفرقة: ${squad ? `${squad.icon} ${squad.name} (${squad.id})` : '—'}`,
    `- الدور: ${isLeader ? 'قائد — تنفّذ ثم ترسل تقريرك عبر ناقل الرسائل' : `مساعد يتبع القائد ${agent.leader || '—'}`}`,
    ``,
    `## مهمة فرقتك`,
    squad ? squad.mission : '—',
    ``,
    `## أدواتك`,
    ...(agent.realTools.length ? agent.realTools.map((t) => `- \`${t}\` (حقيقية — تُنفَّذ محليًا)`) : ['- (لا أدوات حقيقية — اذكر ما تحتاجه لقائده)']),
    ...(agent.tools.length ? [`- قدرات مسجّلة: ${agent.tools.join('، ')}`] : []),
    ``,
    `## مهاراتك`,
    (agent.skills || []).length ? agent.skills.join('، ') : '—',
    (agent.skills || []).includes('llm')
      ? `\nلديك مهارة llm: يمكنك استدعاء Gemini عبر أداة \`llm_call\` عند توفر GEMINI_API_KEY — لا تفعّلها إلا عند الضرورة (توفير الحصة).`
      : '',
    ``,
    `## قواعد العمل`,
    `1. نفّذ أدواتك أولًا، واستنتج من نتائجها — لا تؤلّف نتائج لم تشاهدها.`,
    `2. أكمل التقارير الكبيرة كملفات، واذكر مسار الملف في رسالتك.`,
    `3. إن فشلت أداة، أبلغ قائدك عبر الناقل (${isLeader ? 'فرقتك كلها' : agent.leader}) بدل الصمت.`,
    `4. اكتب بالعربية، باختصار ودقة.`,
    ``,
    ...(context.task ? [`## المهمة الحالية`, context.task] : []),
    ...(context.input ? [`\n## المدخلات`, String(context.input).slice(0, 2000)] : []),
  ].filter((l) => l !== '').join('\n');
}

// prompt موحّد لفرقة كاملة (يُعطى لقادة الخمسة معًا في العرض)
function generateSquadBrief(squadId) {
  const squad = SQUADS[squadId];
  if (!squad) return `فرقة غير معروفة: ${squadId}`;
  return [
    `# ${squad.icon} ${squad.name} (${squad.id})`,
    `المهمة: ${squad.mission}`,
    `المهارات: ${(squad.skills || []).join('، ')}`,
    ``,
    `القادة الخمسة:`,
    ...squad.leaders.map((lid) => {
      const L = AGENTS[lid];
      return `- ${lid}: ${L.nameAr} — أدوات: ${L.realTools.join('، ') || '—'}`;
    }),
  ].join('\n');
}

module.exports = { generatePrompt, generateSquadBrief };
