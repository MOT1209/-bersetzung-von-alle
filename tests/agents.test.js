// tests/agents.test.js — نظام الوكلاء (agents/) — كل شيء محلي بلا شبكة
// يغطي: السجل (registry)، الناقل (bus)، توليد الـ prompts، الأدوات (tools)، والمحرك (engine).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// بلا شبكة ولا مفاتيح: LLM مُعطَّل والحصة لا تُستهلك
delete process.env.GEMINI_API_KEY;

const {
  AGENTS, SQUADS, WORKFLOWS, GUARDIANS, LEGACY_MAP,
  resolveAgentId, getSquad, countAgents,
} = require('../agents/core/registry');
const { generatePrompt, generateSquadBrief } = require('../agents/core/prompts');
const bus = require('../agents/core/bus');
const { TOOLS, hasTool, runTool, saveArtifact } = require('../agents/core/tools');
const { Orchestrator } = require('../agents/core/orchestrator');

// ── السجل ──
describe('registry', () => {
  test('300 وكيلًا: 100 رئيسي × 2 فرعي في 20 فرقة', () => {
    const c = countAgents();
    assert.equal(c.main, 100);
    assert.equal(c.sub, 200);
    assert.equal(c.total, 300);
    assert.equal(c.squads, 20);
  });

  test('كل فرقة 5 قادة ولكل قائد وكيلان فرعيان', () => {
    for (const s of Object.values(SQUADS)) {
      assert.equal(s.leaders.length, 5, `${s.id} يجب أن يكون له 5 قادة`);
      for (const lid of s.leaders) {
        const L = AGENTS[lid];
        assert.ok(L, `القائد ${lid} غير موجود`);
        assert.deepEqual(L.subagents, [`${lid}.1`, `${lid}.2`]);
        assert.ok(AGENTS[`${lid}.1`] && AGENTS[`${lid}.2`]);
      }
    }
  });

  test('كل وكيل لديه أدوات حقيقية (لا وكيل بلا عمل)', () => {
    for (const a of Object.values(AGENTS)) {
      assert.ok(Array.isArray(a.realTools), `${a.id} بلا realTools`);
      assert.ok(a.realTools.length > 0, `${a.id} بلا أدوات حقيقية`);
      for (const t of a.realTools) {
        assert.ok(hasTool(t), `${a.id} يحمل أداة غير معروفة: ${t}`);
      }
    }
  });

  test('الوكلاء القدامى (24) قادة فرق (LEGACY_MAP يعمل)', () => {
    assert.equal(Object.keys(LEGACY_MAP).length, 24);
    assert.equal(resolveAgentId('A1.1'), 'S1:T1');
    assert.equal(AGENTS[resolveAgentId('A1.1')].oldId, 'A1.1');
  });

  test('resolveAgentId: الجديد والقديم وغير المعروف', () => {
    assert.equal(resolveAgentId('S1:T3'), 'S1:T3');
    assert.equal(resolveAgentId('S1:T3.2'), 'S1:T3.2');
    assert.equal(resolveAgentId('nope'), null);
  });

  test('كل سير عمل يشير لوكلاء وفرق موجودة', () => {
    for (const [wfId, wf] of Object.entries(WORKFLOWS)) {
      assert.ok(wf.waves.length > 0, `${wfId} بلا موجات`);
      for (const wave of wf.waves) {
        for (const a of wave.agents) {
          if (wave.squads) assert.ok(getSquad(a), `${wfId}: فرقة غير معروفة ${a}`);
          else assert.ok(resolveAgentId(a), `${wfId}: وكيل غير معروف ${a}`);
        }
      }
    }
  });

  test('ثلاثة حرّاس بمراقبات معرّفة', () => {
    assert.equal(Object.keys(GUARDIANS).length, 3);
    for (const g of Object.values(GUARDIANS)) {
      assert.ok(g.monitors.length > 0 && g.alertOn.length > 0);
      for (const sid of g.monitors) assert.ok(getSquad(sid), `${g.id} يراقب فرقة غير موجودة ${sid}`);
    }
  });
});

// ── توليد الـ prompts ──
describe('prompts', () => {
  test('prompt القائد يحوي الهوية والمهمة والأدوات والقواعد', () => {
    const p = generatePrompt('S1:T3');
    assert.match(p, /S1:T3/);
    assert.match(p, /مدقق الجودة اللغوية/);
    assert.match(p, /قائد/);
    assert.match(p, /translate_text/);
    assert.match(p, /نفّذ أدواتك أولًا/);
  });

  test('المعرّف القديم يعمل في توليد الـ prompt', () => {
    const p = generatePrompt('A1.1');
    assert.match(p, /سابقًا A1\.1/);
    assert.match(p, /S1:T1/);
  });

  test('context.task و context.input يدخلان الـ prompt', () => {
    const p = generatePrompt('S1:T1', { task: 'افحص المزوّدين', input: 'نص تجريبي' });
    assert.match(p, /المهمة الحالية/);
    assert.match(p, /افحص المزوّدين/);
    assert.match(p, /نص تجريبي/);
  });

  test('وكيل فرعي: دوره "مساعد" ويتبع قائده', () => {
    const p = generatePrompt('S1:T3.1');
    assert.match(p, /مساعد يتبع القائد S1:T3/);
  });

  test('prompt غير معروف يعيد رسالة واضحة', () => {
    assert.match(generatePrompt('X99'), /غير معروف/);
  });

  test('generateSquadBrief يعرض القادة الخمسة', () => {
    const b = generateSquadBrief('S9');
    assert.match(b, /S9/);
    assert.match(b, /T5/);
    assert.equal((b.match(/^- S9:T\d/gm) || []).length, 5);
  });
});

// ── الناقل ──
describe('bus', () => {
  test('send مباشرة: المشترك يستقبل والآخر لا', () => {
    bus.reset();
    const got = [];
    const un1 = bus.subscribe('W1', (m) => got.push(['W1', m]));
    bus.subscribe('W2', (m) => got.push(['W2', m]));
    bus.send('W1', { from: 'boss', type: 'report', body: { x: 1 } });
    assert.equal(got.length, 1);
    assert.equal(got[0][0], 'W1');
    assert.equal(got[0][1].from, 'boss');
    un1(); bus.reset();
  });

  test('publish لموضوع: المتابعون فقط يستقبلون', () => {
    bus.reset();
    const got = [];
    bus.subscribeTopic('squad:S77', (m) => got.push(m));
    bus.publish('squad:S77', { from: 'orch', type: 'squad-start', body: {} });
    bus.publish('squad:S78', { from: 'orch', type: 'squad-start', body: {} });
    assert.equal(got.length, 1);
    bus.reset();
  });

  test('الرسائل تُرقّم تسلسليًا ويُستعاد التاريخ', () => {
    bus.reset();
    bus.send('X1', { from: 'a', type: 't', body: 1 });
    bus.send('X1', { from: 'b', type: 't', body: 2 });
    const h = bus.getHistory({ to: 'X1' });
    assert.equal(h.length, 2);
    assert.ok(h[1].id > h[0].id);
    bus.reset();
  });

  test('unreadCount و lastMessageTo', () => {
    bus.reset();
    bus.send('Y1', { from: 'a', type: 't', body: 1 });
    bus.send('Y1', { from: 'b', type: 't', body: 2 });
    assert.equal(bus.unreadCount('Y1'), 2);
    assert.equal(bus.lastMessageTo('Y1').from, 'b');
    bus.reset();
  });

  test('subscribe بمعالج غير دالة لا يكسر', () => {
    bus.reset();
    const un = bus.subscribe('Z1', 'not-a-function');
    assert.equal(typeof un, 'function');
    assert.doesNotThrow(() => bus.send('Z1', { from: 'a', type: 't', body: 1 }));
    un(); bus.reset();
  });
});

// ── الأدوات ──
describe('tools', () => {
  test('كل الأدوات المسجّلة في السجل معرّفة فعليًا', () => {
    for (const name of Object.keys(TOOLS)) assert.equal(hasTool(name), true);
    assert.equal(hasTool('no_such_tool'), false);
  });

  test('read_file يقرأ ملفًا موجودًا', async () => {
    const r = await runTool('read_file', { path: 'package.json' });
    assert.equal(r.ok, true);
    assert.ok(String(r.result).includes('aralink'), 'يجب أن يحوي محتوى package.json');
  });

  test('read_file على ملف غير موجود يفشل بأمان', async () => {
    const r = await runTool('read_file', { path: 'no/such/file.txt' });
    assert.equal(r.ok, false);
    assert.ok(r.result.error);
  });

  test('run_command بلا args يعمل الآن (node --version افتراضيًا)', async () => {
    const r = await runTool('run_command', {});
    assert.equal(r.ok, true, 'run_command بلا args كان يفشل: ' + JSON.stringify(r.result).slice(0, 200));
    assert.match(String(r.result.stdout), /v\d+\./);
  });

  test('run_command بأمر حقيقي يعيد stdout', async () => {
    const r = await runTool('run_command', { cmd: process.execPath, args: ['-e', 'console.log("agents-ok")'] });
    assert.equal(r.ok, true);
    assert.match(String(r.result.stdout), /agents-ok/);
  });

  test('search_code يجد نمطًا موجودًا', async () => {
    const r = await runTool('search_code', { pattern: 'module.exports', dir: 'agents' });
    assert.equal(r.ok, true);
    assert.ok(r.result.matches >= 8);
  });

  test('write_report يكتب artifact ويشير إليه', async () => {
    const r = await runTool('write_report', { name: 'test-report', content: 'محتوى تجريبي' }, { agentId: 'TEST', runId: 't' });
    assert.equal(r.ok, true);
    assert.ok(r.result.artifact);
    assert.ok(r.result.bytes > 0);
    const fs = require('fs');
    assert.ok(fs.existsSync(r.result.artifact));
  });

  test('runTool على أداة غير معروفة يعيد خطأ واضحًا', async () => {
    const r = await runTool('nope', {});
    assert.equal(r.ok, false);
    assert.match(r.result.error, /غير معروفة/);
  });

  test('saveArtifact ينظّف اسم الملف (بلا تجوال في المسار)', () => {
    const ref = saveArtifact('name with spaces/../etc', 'x');
    const base = require('path').basename(ref.artifact);
    assert.doesNotMatch(base, /(\.\.|[/\\])/);
    assert.match(base, /_name_with_spaces_.*etc$/);
  });
});

// ── المحرك والمنسّق (تشغيل حقيقي محلي) ──
describe('engine + orchestrator', () => {
  test('تشغيل وكيل بلا شبكة: تقرير مكتوب ونقل رسائل', async () => {
    bus.reset();
    const orch = new Orchestrator();
    const r = await orch.runAgent('S1:T4', { useLlm: false });
    assert.equal(r.agent, 'S1:T4');
    assert.ok(r.main.file, 'يجب أن يُكتب التقرير');
    assert.equal(r.main.ok, true);
    assert.equal(r.subs.length, 2);
    assert.ok(r.subs.every((s) => s.ok));
    const fs = require('fs');
    const report = fs.readFileSync(r.main.file, 'utf8');
    assert.match(report, /تقرير الوكيل S1:T4/);
    assert.match(report, /نتائج الأدوات/);
    // تنظيف: احذف مجلد التشغيل التجريبي
    fs.rmSync(r.main.file, { });
    fs.rmSync(require('path').dirname(r.main.file), { recursive: true, force: true });
  });

  test('runAgent على وكيل غير معروف يرمي خطأ', async () => {
    const orch = new Orchestrator();
    await assert.rejects(() => orch.runAgent('X99'), /غير معروف/);
  });

  test('runSquad على فرقة غير معروفة يرمي خطأ', async () => {
    const orch = new Orchestrator();
    await assert.rejects(() => orch.runSquad('S99'), /غير معروفة/);
  });

  test('runWorkflow على سير عمل غير معروف يرمي خطأ', async () => {
    const orch = new Orchestrator();
    await assert.rejects(() => orch.runWorkflow('nope'), /غير معروف/);
  });
});
