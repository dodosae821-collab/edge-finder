#!/usr/bin/env node
// ============================================================
// audit_globals.js — Runtime Contract Audit
//
// 목적:
//   1. [audit:globals] namespace migration regression 방지
//      — window.App.* 경로가 있는 함수를 legacy global로 직접 호출하는
//        새 코드 추가를 감지
//   2. [audit:order]  script load-order contract 검증
//      — index.html <script> 순서가 dependency 계약을 위반하지 않는지 확인
//
// 사용:
//   node audit_globals.js          # 전체 audit
//   npm run audit                  # package.json 등록 경로
//
// 출력 형식 (machine-readable, grep-friendly):
//   [audit:globals] journal.js:182 legacy global call: computeBaseStats(
//   [audit:order]   FAIL: state.js must load after app.js
//   [audit:globals] PASS: 0 violations
//   [audit:order]   PASS: script order contract verified
//
// Exit code:
//   0 — 위반 없음
//   1 — 위반 1건 이상
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ── 1. GLOBAL CALL AUDIT ─────────────────────────────────────

// 감지 대상: App namespace에 등록된 함수를 legacy global로 직접 호출하는 경우.
// 각 항목:
//   fn         — 감지할 함수 이름 (호출 패턴: `fn(`)
//   definedIn  — 선언 파일 (이 파일 내 탐지는 skip — declaration false positive 방지)
//   preferred  — 권장 호출 경로 (위반 메시지에 표시)
const GUARDED_FUNCTIONS = [
  // App.compute.*
  { fn: 'computeBaseStats',    definedIn: 'compute.js',       preferred: 'App.compute.computeBaseStats(' },
  { fn: 'computeRiskMetrics',  definedIn: 'compute.js',       preferred: 'App.compute.computeRiskMetrics(' },
  { fn: 'computeCalibration',  definedIn: 'compute.js',       preferred: 'App.compute.computeCalibration(' },
  { fn: 'computeSystemState',  definedIn: 'compute.js',       preferred: 'App.compute.computeSystemState(' },
  { fn: 'computeSimulation',   definedIn: 'compute.js',       preferred: 'App.compute.computeSimulation(' },
  { fn: 'computeJudgeMetrics', definedIn: 'compute.js',       preferred: 'App.compute.computeJudgeMetrics(' },
  { fn: 'computeRoundHistory', definedIn: 'compute.js',       preferred: 'App.compute.computeRoundHistory(' },
  { fn: 'computeAdjProbHint',  definedIn: 'compute.js',       preferred: 'App.compute.computeAdjProbHint(' },
  { fn: 'computeDashboardKPI', definedIn: 'compute.js',       preferred: 'App.compute.computeDashboardKPI(' },
  { fn: 'computeStatsDisplay', definedIn: 'compute.js',       preferred: 'App.compute.computeStatsDisplay(' },
  { fn: 'computeRecentRows',   definedIn: 'compute.js',       preferred: 'App.compute.computeRecentRows(' },
  { fn: 'computeAnalyzeMetrics', definedIn: 'compute.js',     preferred: 'App.compute.computeAnalyzeMetrics(' },

  // App.kelly.*
  { fn: 'computeKellyUnit',     definedIn: 'kelly.js',        preferred: 'App.kelly.computeKellyUnit(' },
  { fn: 'getCalibCorrFactor',   definedIn: 'kelly.js',        preferred: 'App.kelly.getCalibCorrFactor(' },
  { fn: 'getAdaptiveMultiplier',definedIn: 'kelly.js',        preferred: 'App.kelly.getAdaptiveMultiplier(' },

  // App.gate.*
  { fn: 'evaluateDecisionGate', definedIn: 'decision_gate.js', preferred: 'App.gate.evaluateDecisionGate(' },
  { fn: 'buildDecisionContext', definedIn: 'decision_gate.js', preferred: 'App.gate.buildDecisionContext(' },
  { fn: 'getGateConfig',        definedIn: 'decision_gate.js', preferred: 'App.gate.getGateConfig(' },
  { fn: 'applyOverride',        definedIn: 'decision_gate.js', preferred: 'App.gate.applyOverride(' },
  { fn: 'attachGateSnapshot',   definedIn: 'decision_gate.js', preferred: 'App.gate.attachGateSnapshot(' },
  { fn: 'computeSizing',        definedIn: 'decision_gate.js', preferred: 'App.gate.computeSizing(' },

  // App.services.round.*
  { fn: 'lockNewRound',    definedIn: 'round.js', preferred: 'App.services.round.lockNewRound(' },
  { fn: 'applyRoundBet',   definedIn: 'round.js', preferred: 'App.services.round.applyRoundBet(' },
  { fn: 'refundRoundBet',  definedIn: 'round.js', preferred: 'App.services.round.refundRoundBet(' },
  { fn: 'closeActiveRound',definedIn: 'round.js', preferred: 'App.services.round.closeActiveRound(' },
  { fn: 'getRounds',       definedIn: 'round.js', preferred: 'App.services.round.getRounds(' },
  { fn: 'saveRounds',      definedIn: 'round.js', preferred: 'App.services.round.saveRounds(' },
  { fn: 'getActiveRound',  definedIn: 'round.js', preferred: 'App.services.round.getActiveRound(' },
  { fn: 'getRoundHistory', definedIn: 'round.js', preferred: 'App.services.round.getRoundHistory(' },
  { fn: 'saveRoundHistory',definedIn: 'round.js', preferred: 'App.services.round.saveRoundHistory(' },

  // App.services.scope.*
  { fn: 'getBetsByScope',    definedIn: 'scope.js', preferred: 'App.services.scope.getBetsByScope(' },
  { fn: 'getCurrentScope',   definedIn: 'scope.js', preferred: 'App.services.scope.getCurrentScope(' },
  { fn: 'setCurrentScope',   definedIn: 'scope.js', preferred: 'App.services.scope.setCurrentScope(' },
  { fn: 'getCurrentProject', definedIn: 'scope.js', preferred: 'App.services.scope.getCurrentProject(' },
  { fn: 'setCurrentProject', definedIn: 'scope.js', preferred: 'App.services.scope.setCurrentProject(' },
  { fn: 'switchScope',       definedIn: 'scope.js', preferred: 'App.services.scope.switchScope(' },
];

// audit 대상 파일 확장자
const AUDIT_EXTENSIONS = new Set(['.js']);
// 제외 파일 패턴
const EXCLUDE_FILES = new Set([
  'audit_globals.js', // 자기 자신
  'package.json',
]);
// 제외 디렉토리
const EXCLUDE_DIRS = new Set(['node_modules', '.git']);

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        results.push(...collectJsFiles(path.join(dir, entry.name)));
      }
    } else if (
      AUDIT_EXTENSIONS.has(path.extname(entry.name)) &&
      !EXCLUDE_FILES.has(entry.name)
    ) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function auditGlobals() {
  const files = collectJsFiles(ROOT);
  const violations = [];

  for (const { fn, definedIn, preferred } of GUARDED_FUNCTIONS) {
    // 호출 패턴: 함수명 + 여는 괄호
    // 앞에 . 이 있으면 이미 namespaced 호출 — skip (App.compute.computeBaseStats( 등)
    // 앞에 function 키워드가 있으면 선언부 — skip
    const callPattern = new RegExp(
      `(?<!\\.)(?<!function )\\b${fn}\\s*\\(`,
      'g'
    );

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      // 선언 파일은 skip (declaration false positive 방지)
      if (fileName === definedIn) continue;
      // .test.js 파일은 skip — 테스트는 vm ctx로 직접 주입하므로 별도 규칙 적용
      if (fileName.endsWith('.test.js')) continue;

      const src = fs.readFileSync(filePath, 'utf8');
      const lines = src.split('\n');

      lines.forEach((line, idx) => {
        // 주석 라인 skip (// 또는 * 로 시작하는 라인)
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        // 인라인 주석 이후 부분 제거 후 탐지
        const codePart = line.replace(/\/\/.*$/, '');
        if (callPattern.test(codePart)) {
          violations.push({
            file: path.relative(ROOT, filePath),
            line: idx + 1,
            fn,
            preferred,
            src: line.trim(),
          });
        }
        // RegExp lastIndex 리셋 (global flag 사용 시 필요)
        callPattern.lastIndex = 0;
      });
    }
  }

  return violations;
}

// ── 2. SCRIPT ORDER AUDIT ────────────────────────────────────

// load-order contract: [A, B] = "A는 반드시 B보다 먼저 로드되어야 함"
const ORDER_CONTRACTS = [
  ['storage.js', 'app.js'],
  ['app.js',     'kelly.js'],
  ['app.js',     'compute.js'],
  ['app.js',     'decision_gate.js'],
  ['app.js',     'round.js'],
  ['app.js',     'scope.js'],
  ['kelly.js',   'state.js'],
  ['compute.js', 'state.js'],
  ['scope.js',   'state.js'],
  ['round.js',   'state.js'],
  ['state.js',   'bet_form.js'],
  ['state.js',   'bet_list.js'],
  ['state.js',   'charts.js'],
  ['state.js',   'ev.js'],
  ['state.js',   'journal.js'],
  ['state.js',   'settings.js'],
  ['state.js',   'stats.js'],
  ['state.js',   'goal_predict.js'],
];

function auditScriptOrder() {
  const indexPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return [{ type: 'warn', msg: 'index.html not found — script order audit skipped' }];
  }

  const html = fs.readFileSync(indexPath, 'utf8');

  // <script src="./foo.js"> 또는 <script src="foo.js"> 추출
  const scriptRe = /<script\s+src=["'][./]*([^"']+\.js)["']/g;
  const order = [];
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    order.push(path.basename(m[1]));
  }

  // 파일명 → 인덱스 맵
  const indexMap = {};
  order.forEach((f, i) => { indexMap[f] = i; });

  const violations = [];
  for (const [before, after] of ORDER_CONTRACTS) {
    const idxBefore = indexMap[before];
    const idxAfter  = indexMap[after];

    if (idxBefore === undefined) {
      violations.push({ type: 'warn', msg: `${before} not found in index.html — contract [${before} → ${after}] skipped` });
      continue;
    }
    if (idxAfter === undefined) {
      violations.push({ type: 'warn', msg: `${after} not found in index.html — contract [${before} → ${after}] skipped` });
      continue;
    }
    if (idxBefore >= idxAfter) {
      violations.push({ type: 'fail', before, after, idxBefore, idxAfter });
    }
  }

  return violations;
}

// ── 3. BASELINE COMPARISON ───────────────────────────────────
// audit_baseline.txt 에 기존 위반 목록을 저장해 두고,
// 신규 위반(baseline에 없는 것)만 FAIL 처리.
// 목적: 기존 legacy 호출은 허용, 오늘 이후 새로 추가되는 것만 차단.

const BASELINE_FILE = path.join(ROOT, 'audit_baseline.txt');

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set();
  return new Set(
    fs.readFileSync(BASELINE_FILE, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  );
}

function violationKey(v) {
  // 파일명:라인:함수명 으로 고유 키 생성
  // 라인 번호는 코드 이동에 취약하므로 파일+함수명 기준으로도 추적
  return `[audit:globals] ${v.file}:${v.line} legacy global call: ${v.fn}(  →  use ${v.preferred}`;
}

// ── MAIN ─────────────────────────────────────────────────────

function main() {
  let exitCode = 0;
  const baseline = loadBaseline();

  // --- globals audit ---
  const globalViolations = auditGlobals();
  const newViolations    = globalViolations.filter(v => !baseline.has(violationKey(v)));
  const knownViolations  = globalViolations.filter(v =>  baseline.has(violationKey(v)));

  if (globalViolations.length === 0) {
    console.log('[audit:globals] PASS: 0 violations');
  } else if (newViolations.length === 0) {
    console.log(`[audit:globals] PASS: ${knownViolations.length} known baseline violation(s) — no new violations`);
    console.log('[audit:globals] INFO: run "node audit_globals.js --show-baseline" to list known violations');
  } else {
    for (const v of newViolations) {
      console.error(
        `[audit:globals] ${v.file}:${v.line} legacy global call: ${v.fn}(` +
        `  →  use ${v.preferred}`
      );
    }
    console.error(`[audit:globals] FAIL: ${newViolations.length} NEW violation(s) (${knownViolations.length} known baseline)`);
    exitCode = 1;
  }

  // --show-baseline 플래그: 기존 위반 목록 출력 (디버깅용)
  if (process.argv.includes('--show-baseline')) {
    console.log(`\n[audit:globals] --- baseline violations (${knownViolations.length}) ---`);
    for (const v of knownViolations) {
      console.log(`[audit:globals] ${v.file}:${v.line} ${v.fn}(`);
    }
  }

  // --- script order audit ---
  const orderResults = auditScriptOrder();
  const orderFails   = orderResults.filter(r => r.type === 'fail');
  const orderWarns   = orderResults.filter(r => r.type === 'warn');

  for (const w of orderWarns) {
    console.warn(`[audit:order]   WARN: ${w.msg}`);
  }

  if (orderFails.length === 0) {
    console.log('[audit:order]   PASS: script order contract verified');
  } else {
    for (const f of orderFails) {
      console.error(
        `[audit:order]   FAIL: ${f.before} must load before ${f.after}` +
        ` (current: ${f.before}@${f.idxBefore} >= ${f.after}@${f.idxAfter})`
      );
    }
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();
