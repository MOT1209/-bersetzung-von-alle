// agents/index.js — نقطة الدخول لنظام الـ 300 وكيل
//
// الأوامر:
//   list                          البنية الكاملة (20 فرقة × 5 قادة × 3)
//   squads                        قائمة الفرق فقط
//   squad S5                      تفاصيل فرقة (المهمة، الأدوات، المهارات، الوكلاء)
//   agent S1:T3  |  agent A1.1    وكيل واحد — المعرّف الجديد أو القديم
//   prompt S1:T3                  توليد prompt الوكيل من بياناته
//   run agent <id>                تشغيل وكيل (+ فرعيه) فعليًا
//   run squad <S#>                تشغيل فرقة كاملة (15 وكيلًا بالتوازي)
//   run <workflow>                تشغيل سير عمل موجات (القديمة ما زالت تعمل)
//   guardians                     الحرس المتجوّلون
//   bus                           آخر رسائل الناقل
//   stats                         أعداد النظام + حالة الناقل

const { Orchestrator } = require('./core/orchestrator');
const { AGENTS, GUARDIANS, WORKFLOWS, SQUADS, countAgents, resolveAgentId, getSquad } = require('./core/registry');
const { generatePrompt } = require('./core/prompts');
const bus = require('./core/bus');

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];
const extra = args[2];
const orchestrator = new Orchestrator();

function listSquadsBrief() {
  console.log(`\n📋 الفرق (${Object.keys(SQUADS).length}) — كل فرقة 5 قادة × 3 = 15 وكيلًا:\n`);
  for (const s of Object.values(SQUADS)) {
    console.log(`${s.icon} ${s.id}: ${s.name}`);
    console.log(`   ${s.mission}`);
  }
}

async function main() {
  switch (command) {
    case 'list':
      orchestrator.printStructure();
      break;

    case 'squads':
      listSquadsBrief();
      break;

    case 'squad':
      if (!target) return console.log('❌ حدد الفرقة: node agents/index.js squad S5');
      orchestrator.printSquad(target.toUpperCase());
      break;

    case 'agent': {
      if (!target) return console.log('❌ حدد الوكيل: node agents/index.js agent S1:T3  (أو المعرف القديم: agent A1.1)');
      const a = AGENTS[resolveAgentId(target)];
      if (!a) return console.log(`❌ وكيل غير معروف: ${target}`);
      const s = SQUADS[a.squad];
      console.log(`\n${a.icon} ${a.id} — ${a.nameAr}${a.oldId ? ` (سابقًا ${a.oldId})` : ''}`);
      console.log(`   الفرقة: ${s.icon} ${s.name} · الدور: ${a.role === 'leader' ? 'قائد' : 'فرعي'}`);
      console.log(`   المهمة: ${s.mission}`);
      console.log(`   أدوات حقيقية: ${a.realTools.join('، ') || '—'}`);
      console.log(`   قدرات: ${a.tools.join('، ') || '—'}`);
      console.log(`   مهارات: ${a.skills.join('، ') || '—'}`);
      if (a.subagents) for (const sid of a.subagents) console.log(`   🔹 ${sid} — ${AGENTS[sid].nameAr}`);
      if (a.leader) console.log(`   ⬆️ يتبع: ${a.leader}`);
      console.log(`\n— prompt الوكيل —\n${generatePrompt(a.id)}`);
      break;
    }

    case 'prompt':
      if (!target) return console.log('❌ حدد الوكيل: node agents/index.js prompt S1:T3');
      console.log(generatePrompt(target, extra ? { task: extra } : {}));
      break;

    case 'run': {
      const kind = target;
      if (kind === 'agent') {
        if (!extra) return console.log('❌ حدد الوكيل: node agents/index.js run agent S1:T3');
        await orchestrator.runAgent(extra);
      } else if (kind === 'squad') {
        if (!extra) return console.log('❌ حدد الفرقة: node agents/index.js run squad S5');
        await orchestrator.runSquad(extra.toUpperCase());
      } else if (kind && WORKFLOWS[kind]) {
        await orchestrator.runWorkflow(kind);
      } else {
        console.log('❌ صيغة: run agent <id> | run squad <S#> | run <workflow-id>');
        console.log(`   سير العمل: ${Object.keys(WORKFLOWS).join('، ')}`);
      }
      break;
    }

    case 'guardians':
      console.log('\n🛡️ الحرس المتجوّلون:\n');
      for (const g of Object.values(GUARDIANS)) {
        console.log(`${g.icon} ${g.id}: ${g.nameAr}`);
        console.log(`   ${g.description}`);
        console.log(`   يراقب: ${g.monitors.join('، ')} — ينبّه عند: ${g.alertOn.join('، ')}\n`);
      }
      break;

    case 'bus': {
      const msgs = bus.getHistory({ to: extra }).slice(-20);
      console.log(`\n📨 آخر ${msgs.length} رسالة${extra ? ` إلى ${extra}` : ''}:\n`);
      for (const m of msgs) {
        const who = m.kind === 'direct' ? `${m.from} → ${m.to}` : m.kind === 'topic' ? `${m.from} → #${m.topic}` : `${m.from} → 📣 الجميع`;
        console.log(`  #${m.id} [${m.type}] ${who}: ${JSON.stringify(m.body).slice(0, 120)}`);
      }
      if (!msgs.length) console.log('  (لا رسائل)');
      break;
    }

    case 'stats': {
      const c = countAgents();
      const b = bus.stats();
      console.log(`\n📊 النظام: ${c.main} رئيسي × 2 فرعي = ${c.total} وكيلًا · ${c.squads} فرقة · ${Object.keys(WORKFLOWS).length} سير عمل`);
      console.log(`📨 الناقل: ${b.total} رسالة في الذاكرة (seq=${b.seq})${b.logFile ? `\n📁 السجل: ${b.logFile}` : ''}`);
      break;
    }

    default:
      console.log(`
🧠 نظام الوكلاء — ترجِم (${countAgents().total} وكيلًا)
═══════════════════════════════════════

  list                      البنية الكاملة
  squads                    قائمة الفرق العشرين
  squad <S#>                تفاصيل فرقة
  agent <id>                بطاقة وكيل (S1:T3 أو A1.1 القديم)
  prompt <id> [مهمة]        توليد prompt الوكيل
  run agent <id>            تشغيل وكيل + فرعيه
  run squad <S#>            تشغيل فرقة كاملة (15 وكيلًا)
  run <workflow>            سير عمل موجات
  guardians                 الحرس المتجوّلون
  bus [to <id>]             رسائل الناقل الأخيرة
  stats                     إحصاءات النظام

سير العمل: ${Object.keys(WORKFLOWS).join('، ')}

أمثلة:
  node agents/index.js list
  node agents/index.js squad S15
  node agents/index.js agent S1:T3
  node agents/index.js agent A1.1          (المعرّف القديم يعمل)
  node agents/index.js run squad S8
  node agents/index.js run translate-youtube
  node agents/index.js run full-audit
`);
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
