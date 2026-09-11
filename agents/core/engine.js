// agents/core/engine.js — محرك تنفيذ الوكلاء (هجين)
//
// الدورة الكاملة لكل وكيل عند تشغيله:
//   1. الاشتراك في ناقل الرسائل (لرسائل مباشرة + مواضيع فرقته)
//   2. إعلان "بدأت" في موضوع فرقته
//   3. تنفيذ أدواته المسجّلة (realTools) بالترتيب — أدوات حقيقية محلية
//   4. إن كان لديه مهارة llm ومفتاح متاح → يلخّص نتيجته عبر LLM (اختياري)
//   5. يكتب تقريره في specs/agents/<runId>/<agentId>.md
//   6. يعلن "انتهيت" ويرسل نتيجته لقائده عبر الناقل
//
// بلا مفتاح LLM يبقى كل شيء محليًا حقيقيًا: الأدوات تعمل، التقارير تُكتب،
// والرسائل تتدفق — الحصة لا تُستهلك إلا إذا طُلب ذلك صراحة.
const fs = require('fs');
const path = require('path');
const { send, publish, subscribe, subscribeTopic } = require('./bus');
const { runTool } = require('./tools');
const llm = require('./llm');

function reportDir(runId) {
  const dir = path.join(process.cwd(), 'specs', 'agents', runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReport(runId, agentId, report) {
  const file = path.join(reportDir(runId), `${agentId.replace(/[^\w.]/g, '_')}.md`);
  fs.writeFileSync(file, report);
  return path.relative(process.cwd(), file);
}

// تنفيذ وكيل واحد — يُعاد تقريره ونتائج أدواته
async function executeAgent(agent, { runId, depth = 0, context = {} }) {
  const unsub = subscribe(agent.id, (msg) => {
    // الرسائل الواردة أثناء التنفيذ تُسجَّل في سياق الوكيل — الوكيل "يراها"
    context._inbox = context._inbox || [];
    context._inbox.push(msg);
  });
  const topicUnsub = agent.squad ? subscribeTopic(`squad:${agent.squad}`, () => {}) : null;

  const started = Date.now();
  publish(`squad:${agent.squad || 'none'}`, { from: agent.id, type: 'agent-started', body: { runId } });

  const toolResults = [];
  try {
    for (const toolName of agent.realTools || []) {
      const r = await runTool(toolName, context.toolArgs?.[toolName] || {}, { agentId: agent.id, runId });
      toolResults.push({ tool: toolName, ...r });
    }

    // طبقة LLM الاختيارية (هجين): فقط لو لديه المهارة والمفتاح موجود
    let llmSummary = null;
    if ((agent.skills || []).includes('llm') && llm.available() && context.useLlm !== false) {
      try {
        const brief = toolResults.map((t) => `${t.tool}: ${t.ok ? 'OK' : 'FAIL'}`).join('، ');
        llmSummary = await llm.call(
          `أنت الوكيل ${agent.nameAr} في فرقة ${agent.squad}. نفّذت أدواتك (${brief}) ضمن مهمة فرقتك: ${agent.mission}. اكتب تقريرًا من 3 أسطر بالعربية.`,
          'أنت وكيل برمجي مختص. ردودك مختصرة وعملية بالعربية.'
        );
      } catch (e) {
        llmSummary = `(تعذّر LLM: ${e.message})`;
      }
    }

    // نجاح الوكيل = أدواته الأساسية نجحت. فشل LLM الاختياري (llmOptional)
    // لا يُفشله — عقد العمل الهجين: المحلي أساس وLLM تحسين اختياري.
    const allOk = toolResults.every((t) => t.ok || t.llmOptional);
    const ms = Date.now() - started;
    const report = [
      `# تقرير الوكيل ${agent.id} — ${agent.nameAr || agent.name}`,
      ``,
      `- **الفرقة:** ${agent.squad || '—'} · **الرئيس:** ${agent.leader || '—'}`,
      `- **مهمة الفرقة:** ${agent.mission || '—'}`,
      `- **المدة:** ${ms}ms`,
      ``,
      `## نتائج الأدوات`,
      ...(toolResults.length
        ? toolResults.map((t) => `- \`${t.tool}\` → ${t.ok ? '✅' : '❌'} ${JSON.stringify(t.result).slice(0, 300)}`)
        : ['- (لا أدوات مسجّلة لهذا التشغيل)']),
      ``,
      ...(llmSummary ? [`## ملخص LLM`, llmSummary, ``] : []),
      ...(context._inbox?.length ? [`## رسائل واردة أثناء التنفيذ: ${context._inbox.length}`] : []),
    ].join('\n');

    const file = writeReport(runId, agent.id, report);
    publish(`squad:${agent.squad || 'none'}`, { from: agent.id, type: 'agent-done', body: { runId, file, ok: allOk } });
    if (agent.leader) send(agent.leader, { from: agent.id, type: 'report', body: { runId, file, ok: allOk } });

    return { agentId: agent.id, ok: allOk, ms, file, toolResults };
  } catch (e) {
    publish(`squad:${agent.squad || 'none'}`, { from: agent.id, type: 'agent-failed', body: { runId, error: e.message } });
    return { agentId: agent.id, ok: false, ms: Date.now() - started, error: e.message };
  } finally {
    unsub?.(); topicUnsub?.();
  }
}

// تنفيذ وكيل رئيسي + فرعيه (2 sub) — الرئيس أولاً ثم الفرعيان بالتوازي
async function executeWithSubs(mainAgent, subAgents, opts) {
  const mainResult = await executeAgent(mainAgent, opts);
  const subResults = await Promise.all((subAgents || []).map((s) => executeAgent(s, { ...opts, depth: 1 })));
  return { main: mainResult, subs: subResults };
}

module.exports = { executeAgent, executeWithSubs, writeReport };
