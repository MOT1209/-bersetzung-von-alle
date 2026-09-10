// agents/core/orchestrator.js — الوكيل المنسّق الرئيسي
// يوزّع المهام على الوكلاوات ويتابع التقدم ويكشف التعارضات

const { AGENTS, GUARDIANS, WORKFLOWS } = require('./registry');

class Orchestrator {
  constructor() {
    this.activeTasks = new Map();
    this.completedTasks = [];
    this.failedTasks = [];
    this.results = new Map();
  }

  // ═══════════════════════════════════════════════════════════
  // تشغيل workflow كامل
  // ═══════════════════════════════════════════════════════════
  async runWorkflow(workflowId, context = {}) {
    const workflow = WORKFLOWS[workflowId];
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 بدء سير العمل: ${workflow.name}`);
    console.log(`${'═'.repeat(60)}\n`);

    const startTime = Date.now();

    for (let i = 0; i < workflow.waves.length; i++) {
      const wave = workflow.waves[i];
      console.log(`\n🌊 الموجة ${i + 1}/${workflow.waves.length}: ${wave.name}`);
      console.log(`   الوكلاء: ${wave.agents.join(', ')}`);
      console.log(`   الوضع: ${wave.mode === 'parallel' ? 'متوازي' : 'تسلسلي'}`);

      const waveStart = Date.now();

      if (wave.mode === 'parallel') {
        await this.runWaveParallel(wave.agents, context);
      } else {
        await this.runWaveSequential(wave.agents, context);
      }

      const waveTime = ((Date.now() - waveStart) / 1000).toFixed(1);
      console.log(`   ✅ اكتملت الموجة في ${waveTime} ثانية`);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🎉 اكتمل سير العمل في ${totalTime} ثانية`);
    console.log(`   مهام ناجحة: ${this.completedTasks.length}`);
    console.log(`   مهام فاشلة: ${this.failedTasks.length}`);
    console.log(`${'═'.repeat(60)}\n`);

    return {
      workflow: workflow.name,
      totalTime: `${totalTime}s`,
      completed: this.completedTasks.length,
      failed: this.failedTasks.length,
      results: Object.fromEntries(this.results),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // تشغيل موجة بالموازاة
  // ═══════════════════════════════════════════════════════════
  async runWaveParallel(agentIds, context) {
    const promises = agentIds.map(id => this.runAgent(id, context));
    await Promise.allSettled(promises);
  }

  // ═══════════════════════════════════════════════════════════
  // تشغيل موجة تسلسلياً
  // ═══════════════════════════════════════════════════════════
  async runWaveSequential(agentIds, context) {
    for (const id of agentIds) {
      await this.runAgent(id, context);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // تشغيل وكيل واحد
  // ═══════════════════════════════════════════════════════════
  async runAgent(agentId, context) {
    const agent = AGENTS[agentId];
    if (!agent) {
      console.log(`   ⚠️ وكيل غير معروف: ${agentId}`);
      return;
    }

    const startTime = Date.now();
    console.log(`   🔧 ${agent.icon} ${agent.nameAr || agent.name}...`);

    try {
      // محاكاة عمل الوكيل (في التطبيق الحقيقي، يُستخدم Task tool)
      const result = await this.executeAgentTasks(agent, context);
      
      this.completedTasks.push(agentId);
      this.results.set(agentId, result);
      
      const time = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   ✅ ${agent.icon} ${agent.nameAr || agent.name} (${time}s)`);
      
      return result;
    } catch (error) {
      this.failedTasks.push(agentId);
      console.log(`   ❌ ${agent.icon} ${agent.nameAr || agent.name} - خطأ: ${error.message}`);
      
      return { error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // تنفيذ مهام الوكيل
  // ═══════════════════════════════════════════════════════════
  async executeAgentTasks(agent, context) {
    // هذا_MOULD_يتم استبداله بتنفيذ حقيقي باستخدام Task tool
    // حالياً يُرجع معلومات عن المهام
    return {
      agentId: agent.id,
      name: agent.name,
      nameAr: agent.nameAr,
      tasks: agent.tasks || [],
      context: context,
      timestamp: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // جلب معلومات وكيل
  // ═══════════════════════════════════════════════════════════
  getAgent(agentId) {
    return AGENTS[agentId] || null;
  }

  // ═══════════════════════════════════════════════════════════
  // جلب جميع الوكلاء الرئيسيين
  // ═══════════════════════════════════════════════════════════
  getMainAgents() {
    return Object.values(AGENTS).filter(a => !a.id.includes('.'));
  }

  // ═══════════════════════════════════════════════════════════
  // جلب وكلاء فرعي لوكيل معين
  // ═══════════════════════════════════════════════════════════
  getSubAgents(parentId) {
    return Object.values(AGENTS).filter(a => a.parent === parentId);
  }

  // ═══════════════════════════════════════════════════════════
  // طباعة الهيكل الكامل
  // ═══════════════════════════════════════════════════════════
  printStructure() {
    console.log('\n' + '═'.repeat(60));
    console.log('🧠 هيكل نظام الوكلاوات — AraLink');
    console.log('═'.repeat(60) + '\n');

    const mainAgents = this.getMainAgents();
    for (const agent of mainAgents) {
      console.log(`${agent.icon} ${agent.id}: ${agent.nameAr || agent.name}`);
      console.log(`   ${agent.description}`);
      
      const subs = this.getSubAgents(agent.id);
      for (const sub of subs) {
        console.log(`   ├── ${sub.icon} ${sub.id}: ${sub.nameAr || sub.name}`);
      }
      console.log('');
    }

    console.log('\n🛡️ الحرس المتجوّلون:');
    for (const [id, guardian] of Object.entries(GUARDIANS)) {
      console.log(`   ${guardian.icon} ${id}: ${guardian.nameAr || guardian.name}`);
    }

    console.log('\n📋 سير العمل المتاح:');
    for (const [id, workflow] of Object.entries(WORKFLOWS)) {
      console.log(`   • ${workflow.name} (${workflow.waves.length} موجات)`);
    }
  }
}

module.exports = { Orchestrator };
