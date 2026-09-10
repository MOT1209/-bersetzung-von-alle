// agents/index.js — نقطة الدخول الرئيسية لنظام الوكلاوات
// يُستخدم لتشغيل سير العمل أو وكيل معيّن

const { Orchestrator } = require('./core/orchestrator');
const { AGENTS, GUARDIANS, WORKFLOWS } = require('./core/registry');
const { generatePrompt } = require('./core/prompts');

// ═══════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

const orchestrator = new Orchestrator();

async function main() {
  switch (command) {
    case 'list':
      orchestrator.printStructure();
      break;

    case 'run':
      if (!target) {
        console.log('❌ حدد سير العمل: node agents/index.js run <workflow-id>');
        console.log('   سير العمل المتاح:');
        Object.entries(WORKFLOWS).forEach(([id, w]) => {
          console.log(`   - ${id}: ${w.name}`);
        });
        return;
      }
      await orchestrator.runWorkflow(target);
      break;

    case 'agent':
      if (!target) {
        console.log('❌ حدد الوكيل: node agents/index.js agent <agent-id>');
        console.log('   الوكلاء المتاحون:');
        Object.keys(AGENTS).forEach(id => {
          const a = AGENTS[id];
          if (!id.includes('.')) {
            console.log(`   - ${id}: ${a.nameAr || a.name}`);
          }
        });
        return;
      }
      const agent = AGENTS[target];
      if (!agent) {
        console.log(`❌ وكيل غير معروف: ${target}`);
        return;
      }
      console.log(`\n${agent.icon} ${agent.nameAr || agent.name}`);
      console.log(`${agent.description}\n`);
      console.log('ال_prompt:');
      console.log(generatePrompt(target));
      break;

    case 'prompt':
      if (!target) {
        console.log('❌ حدد الوكيل: node agents/index.js prompt <agent-id>');
        return;
      }
      console.log(generatePrompt(target));
      break;

    case 'guardians':
      console.log('\n🛡️ الحرس المتجوّلون:\n');
      Object.values(GUARDIANS).forEach(g => {
        console.log(`${g.icon} ${g.id}: ${g.nameAr || g.name}`);
        console.log(`   ${g.description}`);
        console.log(`   يراقب: ${g.monitors.join(', ')}`);
        console.log(`   يُنبّه عند: ${g.alertOn.join(', ')}`);
        console.log('');
      });
      break;

    default:
      console.log(`
🧠 نظام الوكلاوات — AraLink
═══════════════════════════════════════

الأوامر المتاحة:

  list                    عرض هيكل الوكلاوات الكامل
  run <workflow-id>       تشغيل سير عمل
  agent <agent-id>        عرض معلومات وكيل
  prompt <agent-id>       عرض prompt الوكيل
  guardians               عرض الحرس المتجوّلون

سير العمل المتاح:
${Object.entries(WORKFLOWS).map(([id, w]) => `  - ${id}: ${w.name}`).join('\n')}

مثال:
  node agents/index.js list
  node agents/index.js run translate-youtube
  node agents/index.js agent A1.1
  node agents/index.js prompt A2.1
      `);
  }
}

main().catch(console.error);
