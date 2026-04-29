// ============================================================
// ocr_import.js — 📸 프로토 결과 OCR 반자동 입력 시스템
// ============================================================
// 의존: Tesseract.js (CDN), 기존 bets 배열, applyOcrResult()
// 진입점: openOcrImport()
// ============================================================

// ── 상수 ──────────────────────────────────────────────────────
const OCR_VERSION = '1.0.0';

// 확신도 임계값
const CONF_AUTO   = 0.90;   // 자동 체크 (초록)
const CONF_WARN   = 0.70;   // 수동 확인 필요 (노랑)
// CONF_WARN 미만 → 매칭 실패 (빨강)

// ambiguity: 1위-2위 점수 차가 이 값 미만이면 자동 매칭 금지
const AMBIGUITY_GAP = 0.10;

// 날짜 신호 없을 때 confidence 감쇠 계수
const NO_DATE_DECAY = 0.85;

// OCR 엔진 confidence → 매칭 confidence 반영 가중치
// 0이면 미반영, 1이면 완전 반영 (권장: 0.15 — 보조 신호로만 활용)
const OCR_CONF_WEIGHT = 0.15;

// 날짜 범위 필터 (촬영일 기준 ±일)
const DATE_RANGE_DAYS = 2;

// 팀명 유사도 임계값
const SIMILARITY_AUTO = 0.85;
const SIMILARITY_CAND = 0.60;

// ── 구조 기반 파싱 상수 ────────────────────────────────────────
// 경기번호 직접 매칭 시 부여하는 confidence
const GAME_NUM_CONF   = 1.00;

// 배당률 보조 매칭 가중치 — teamSim과 oddsScore를 가중 평균할 때 배당 비중
// 0.20 = "배당이 팀명 유사도의 약 1/4 영향력"
// 너무 높이면 배당 오인식이 매칭을 망가뜨림
const ODDS_WEIGHT     = 0.20;

// 배당률 허용 오차 (이 범위 내 = 완전 일치로 간주)
const ODDS_MATCH_TOL  = 0.05;

// 푸터 감지용 키워드 (이 라인부터 파싱 중단)
const FOOTER_KEYWORDS = ['예상 적중배당률', '개별투표금액', '예상 적중금', '총투표금액', '총 투표금액'];

// ── 베팅 마켓 prefix 정의 ──────────────────────────────────────
// 프로토 용지에서 경기번호 앞(또는 팀명 앞)에 붙는 마켓 구분 기호
// 우선순위: 긴 패턴부터 먼저 매칭 (Hh > H, Uh > U)
const MARKET_PREFIX_MAP = {
  'Hh': { label: '전반핸디캡', short: '전반H' },  // 전반 핸디캡
  'Uh': { label: '전반언오버', short: '전반UO' },  // 전반 언더/오버
  'H':  { label: '핸디캡',    short: 'H' },        // 핸디캡
  'h':  { label: '전반',      short: '전반' },      // 전반 승부
  'U':  { label: '언오버',    short: 'UO' },        // 언더/오버
  '1':  { label: '핸디결과',  short: '1pt' },       // 핸디 결과 타입 (1점차/무 포함)
};

// prefix 정규식: 행 맨 앞(^)에서만 마켓 prefix를 추출.
// 규칙:
//   - H/h/U/Hh/Uh: 뒤에 공백 또는 * 가 바로 올 때 (숫자로만 이어지면 팀명일 수 있음)
//   - 1: 반드시 뒤에 공백이 와야 함 (116처럼 경기번호 앞자리와 혼동 방지)
//   - ^ 앵커 필수: 행 중간에서 우연히 매칭되는 것 완전 차단
//   - "116애틀브레" 같이 공백 없이 붙어도 안전하게 차단
// 예시:
//   "Hh*222 삼성..."   → prefix='Hh', rest='*222 삼성...'
//   "H 103 인디페이..."→ prefix='H',  rest='103 인디페이...'
//   "h*0794 한화..."   → prefix='h',  rest='*0794 한화...'
//   "Uh*0796 한화..."  → prefix='Uh', rest='*0796 한화...'
//   "1 *0766 SSG..."   → prefix='1',  rest='*0766 SSG...'
//   "116 애틀브레..."  → prefix=null  (^ 뒤에서 1 다음 공백 없이 숫자 이어짐)
const MARKET_PREFIX_RE = /^(Hh|Uh|H|h|U)(?=[\s*])\s*(.*)|^(1)(?=\s)(.*)/;

/**
 * 행 맨 앞에서 마켓 prefix를 추출한다.
 * @param {string} line  원본 라인
 * @returns {{ marketType: string|null, rest: string }}
 *   marketType: 'H' | 'h' | 'U' | 'Uh' | 'Hh' | '1' | null
 *   rest: prefix 제거 후 남은 문자열 (경기번호부터 시작)
 */
function extractMarketPrefix(line) {
  const m = line.match(MARKET_PREFIX_RE);
  if (!m) return { marketType: null, rest: line };
  // 정규식 두 대안: 그룹1/2 = H계열·U계열, 그룹3/4 = '1'
  const marketType = m[1] || m[3];
  const rest       = ((m[2] !== undefined ? m[2] : m[4]) || '').trimStart();
  return { marketType, rest };
}

/**
 * bet.type 필드 값 → 표준 marketType 문자열로 정규화
 * (저장 방식이 시스템마다 다를 수 있으므로 유연하게 처리)
 */
function normalizeBetMarketType(betType) {
  if (!betType) return null;
  const t = betType.toLowerCase();
  if (t.includes('전반') && t.includes('핸')) return 'Hh';
  if (t.includes('전반') && (t.includes('언') || t.includes('오버'))) return 'Uh';
  if (t.includes('전반')) return 'h';
  if (t.includes('핸')) return 'H';
  if (t.includes('언') || t.includes('오버')) return 'U';
  if (t === '1' || t.includes('1점')) return '1';
  return null;
}

/**
 * OCR marketType ↔ bet marketType 일치 여부 점수 (0~1)
 *
 *   1.0 = 완전 일치 (둘 다 값 있고 같음)
 *   0.5 = 둘 다 null (정보 없음 → 중립, 기존 점수 유지)
 *   0.35= OCR有 / bet無 → OCR에서 특정 마켓임이 명시됐는데 bet에 타입 없음
 *         → 일반 승패로 등록된 경기에 H/Uh 등이 매칭되는 오류 방지 (약한 패널티)
 *   0.45= OCR無 / bet有 → bet에 타입 있는데 OCR이 prefix 없음
 *         → OCR 미인식 가능성 있으므로 더 관대하게 처리
 *   0.0 = 명시적 불일치 (둘 다 값 있고 다름 → 강한 패널티)
 */
function marketTypeScore(ocrMarket, betMarket) {
  if (ocrMarket === null && betMarket === null) return 0.5;   // 둘 다 미상 → 중립
  if (ocrMarket !== null && betMarket === null) return 0.35;  // OCR有/bet無 → 약한 패널티
  if (ocrMarket === null && betMarket !== null) return 0.45;  // OCR無/bet有 → 더 관대
  return ocrMarket === betMarket ? 1.0 : 0.0;                 // 명시적 일치/불일치
}

// ── 팀명 Alias 테이블 (지속 업데이트됨) ────────────────────────
const DEFAULT_ALIAS_MAP = {
  // 오인식 패턴 → 정규명
  '수워': '수원', '수원fc': '수원FC', '수원 fc': '수원FC',
  '전북현대': '전북', '전북현대모터스': '전북', '전북현대fc': '전북',
  '서울fc': '서울', 'fc서울': '서울',
  '울산현대': '울산', '울산hd': '울산',
  '포항스틸러스': '포항', '포항sc': '포항',
  '인천유나이티드': '인천',
  '성남fc': '성남', '성남일화': '성남',
  '광주fc': '광주',
  '대전하나': '대전', '대전시티즌': '대전',
  '제주유나이티드': '제주',
  // 숫자/특수문자 오인식
  '0': 'O', '1l': '인천',
};

// ── localStorage 기반 alias 영속화 ────────────────────────────
function loadAliasMap() {
  try {
    const saved = JSON.parse(localStorage.getItem('ocr_alias_map') || '{}');
    return { ...DEFAULT_ALIAS_MAP, ...saved };
  } catch { return { ...DEFAULT_ALIAS_MAP }; }
}

function saveAliasMap(map) {
  try {
    // DEFAULT_ALIAS_MAP을 제외한 사용자 추가분만 저장
    const userAdded = {};
    for (const [k, v] of Object.entries(map)) {
      if (DEFAULT_ALIAS_MAP[k] !== v) userAdded[k] = v;
    }
    localStorage.setItem('ocr_alias_map', JSON.stringify(userAdded));
  } catch {}
}

function addAlias(raw, normalized) {
  const map = loadAliasMap();
  map[raw.toLowerCase().trim()] = normalized.trim();
  saveAliasMap(map);
}

// ── 이미지 전처리 ──────────────────────────────────────────────
function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_W = 1800;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 그레이스케일 + 대비 강화
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          // 그레이스케일
          const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          // 대비 강화 (factor 1.8)
          const contrasted = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128));
          data[i] = data[i+1] = data[i+2] = contrasted;
        }

        ctx.putImageData(imageData, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch(e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')); };
    img.src = url;
  });
}

// ── 스코어 파싱 ────────────────────────────────────────────────
function extractAllScorePairs(text) {
  // 구분자: : ： - － ∶ 공백1개 등
  const re = /(\d{1,2})\s*[:：\-－∶]\s*(\d{1,2})/g;
  const pairs = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const a = parseInt(m[1]), b = parseInt(m[2]);
    // 시간(90:00 등) 제외: 둘 다 10 이하이거나 합이 20 이하
    if (a <= 15 && b <= 15) {
      pairs.push({ a, b, sum: a + b, raw: m[0] });
    }
  }
  return pairs;
}

function pickFinalScore(pairs) {
  if (!pairs.length) return null;
  // 합이 가장 큰 쌍 = 최종 스코어 (전반/연장 혼재 대응)
  return pairs.sort((x, y) => y.sum - x.sum)[0];
}

// ── 팀명 정규화 ────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m+1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function jaccardSimilarity(a, b) {
  const setA = new Set([...a]);
  const setB = new Set([...b]);
  const inter = new Set([...setA].filter(c => setB.has(c)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

function strSimilarity(a, b) {
  const na = a.toLowerCase().replace(/\s/g,'');
  const nb = b.toLowerCase().replace(/\s/g,'');
  if (na === nb) return 1.0;
  const lev  = levenshtein(na, nb);
  const levS = 1 - lev / Math.max(na.length, nb.length, 1);
  const jacS = jaccardSimilarity(na, nb);
  return (levS * 0.6 + jacS * 0.4);
}

// 기존 bets에서 팀명 목록 추출
function getKnownTeams() {
  const bets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
  const teams = new Set();
  bets.forEach(b => {
    if (b.game && b.game !== '-') {
      // "전북 vs 서울", "전북/서울" 등 분리
      const parts = b.game.split(/\s+vs\s+|\s+VS\s+|\/|,/i);
      parts.forEach(p => { const t = p.trim(); if (t) teams.add(t); });
    }
  });
  return [...teams];
}

function normalizeTeam(raw, knownTeams) {
  const aliasMap = loadAliasMap();
  const key = raw.toLowerCase().trim();

  // 1단계: alias 직접 매핑
  if (aliasMap[key]) {
    return { team: aliasMap[key], confidence: 1.0, candidates: [aliasMap[key]], source: 'alias' };
  }

  // 2단계: 알려진 팀명과 유사도 비교
  if (!knownTeams.length) {
    return { team: raw.trim(), confidence: 0.5, candidates: [raw.trim()], source: 'raw' };
  }

  const scored = knownTeams.map(t => ({ t, s: strSimilarity(raw, t) }))
                           .sort((a, b) => b.s - a.s);

  const best = scored[0];
  const candidates = scored.filter(x => x.s >= SIMILARITY_CAND).slice(0, 3).map(x => x.t);

  if (best.s >= SIMILARITY_AUTO) {
    return { team: best.t, confidence: best.s, candidates, source: 'auto' };
  }
  if (best.s >= SIMILARITY_CAND) {
    return { team: best.t, confidence: best.s, candidates, source: 'candidate' };
  }

  // 3단계: 매칭 실패
  return { team: raw.trim(), confidence: best.s, candidates: candidates.slice(0,2), source: 'failed' };
}

// ── 구조 기반 OCR 파서 ────────────────────────────────────────
//
// 프로토 용지 행 구조 (헤더: 경기 홈팀 : 원정팀 예상 배당률):
//   [*]경기번호  홈팀  [핸디캡]  :  원정팀  예상결과  배당률
//
// 파싱 단계에서는 항상 홈:원정 순서로 고정.
// 홈/원정 방향 판단은 매칭 단계(matchBetToOcr)에서 양방향 비교로 처리.

// 핸디캡이 팀명에 붙어 있는 경우 분리
// ex) "대한항공185.5" → { team:"대한항공", handicap:185.5 }
// ex) "PSG -1.0"      → { team:"PSG",      handicap:-1.0 }
function splitTeamHandicap(raw) {
  const m = raw.match(/^(.+?)\s*(-?\d+\.?\d+)$/);
  if (!m) return { team: raw.trim(), handicap: null };
  // 팀명 부분이 비어있으면 전체를 팀명으로 취급
  const teamPart = m[1].trim();
  if (!teamPart) return { team: raw.trim(), handicap: null };
  return { team: teamPart, handicap: parseFloat(m[2]) };
}

// 예상결과 토큰 목록
const PICK_TOKENS = new Set(['승', '패', '무', '홈승', '원정승', '오버', '언더', '오버언더']);

// 단일 행을 구조 파싱
// 반환: null (파싱 실패) 또는 구조체
function parseProtoRow(line) {
  // ── 푸터 감지: 이 라인이 푸터 키워드 포함이면 null ──────
  if (FOOTER_KEYWORDS.some(kw => line.includes(kw))) return null;

  // ── 헤더 행 skip ─────────────────────────────────────────
  if (/^경기\s+홈/.test(line)) return null;

  // ── [Step 1] 마켓 prefix 추출 ────────────────────────────
  // 행 맨 앞에 H / h / U / Uh / Hh / 1 등이 오면 marketType으로 분리.
  // prefix는 경기번호 앞에 위치. 제거하지 않고 별도 필드로 보존.
  // 예: "Hh*222 삼성 -1.5 : 롯데 패 1.44"
  //   → marketType = 'Hh', lineAfterPrefix = "*222 삼성 -1.5 : 롯데 패 1.44"
  const { marketType, rest: lineAfterPrefix } = extractMarketPrefix(line);

  // ── [Step 2] 경기번호 추출 ───────────────────────────────
  // 패턴: 선택적 * + 3~4자리 숫자 (prefix 제거 후 라인 기준)
  const numMatch = lineAfterPrefix.match(/^(\*?)(\d{3,4})\s+(.*)/);
  if (!numMatch) return null;

  const isBetTarget = numMatch[1] === '*';   // * = 단폴 구매 가능 경기
  const gameNum     = numMatch[2];           // "176", "089" 등
  const rest        = numMatch[3];           // 경기번호 이후 나머지

  // ── ":" 구분자로 홈 / 원정 영역 분리 ─────────────────────
  // OCR이 ： (전각)로 인식하기도 함
  const colonIdx = rest.search(/\s*[：:]\s*/);
  if (colonIdx === -1) return null;

  const homeRaw  = rest.slice(0, colonIdx).trim();
  const afterCol = rest.slice(rest.indexOf(':', colonIdx) + 1 < rest.length
                             ? rest.indexOf(':', colonIdx) + 1
                             : colonIdx + 1).trim();

  // ── afterCol에서 원정팀 / 예상결과 / 배당률 분리 ─────────
  // 배당률: 끝쪽 소수점 2자리 숫자
  // 예상결과: 배당률 바로 앞 토큰
  const tokens = afterCol.split(/\s+/);
  let odds = null, pick = null, awayRaw = '';

  // 역방향 탐색: 배당률 → 예상결과 → 나머지=원정팀
  const oddsRe = /^\d+\.\d{2}$/;
  let ti = tokens.length - 1;

  if (ti >= 0 && oddsRe.test(tokens[ti])) {
    odds = parseFloat(tokens[ti--]);
  }
  if (ti >= 0 && PICK_TOKENS.has(tokens[ti])) {
    pick = tokens[ti--];
  }
  awayRaw = tokens.slice(0, ti + 1).join(' ').trim();

  if (!homeRaw && !awayRaw) return null;

  // ── 홈팀 핸디캡 분리 ─────────────────────────────────────
  const { team: homeTeam, handicap } = splitTeamHandicap(homeRaw);
  const awayTeam = awayRaw.trim();

  return {
    gameNum,          // "176"
    isBetTarget,      // true = * 경기
    marketType,       // 'H' | 'h' | 'U' | 'Uh' | 'Hh' | '1' | null
    rawHome: homeTeam,
    rawAway: awayTeam,
    handicap,         // null | number
    pick,             // "오버" | "승" | null
    odds,             // 1.64 | null
    rawLine: line,
  };
}

// 결과 OCR 파싱 (스코어 포함 행 별도 처리)
// 결과 용지는 예상결과 열 대신 "실제스코어" 열이 들어옴
// 구조: [marketType] [*]번호  홈팀  [핸디]  :  원정팀  홈스코어  :  원정스코어
function parseResultRow(line) {
  if (FOOTER_KEYWORDS.some(kw => line.includes(kw))) return null;
  if (/^경기\s+홈/.test(line)) return null;

  // ── [Step 1] 마켓 prefix 추출 ────────────────────────────
  const { marketType, rest: lineAfterPrefix } = extractMarketPrefix(line);

  // ── [Step 2] 경기번호 추출 ───────────────────────────────
  const numMatch = lineAfterPrefix.match(/^(\*?)(\d{3,4})\s+(.*)/);
  if (!numMatch) return null;

  const isBetTarget = numMatch[1] === '*';
  const gameNum     = numMatch[2];
  const rest        = numMatch[3];

  // 스코어 쌍 찾기 (전각/반각 콜론)
  const scorePairs = extractAllScorePairs(rest);
  if (!scorePairs.length) return null;
  const score = pickFinalScore(scorePairs);

  // 스코어 양쪽 분리
  const scoreRe = /(\d{1,2})\s*[:：]\s*(\d{1,2})/;
  const scoreMatch = rest.match(scoreRe);
  if (!scoreMatch) return null;

  const beforeScore = rest.slice(0, rest.indexOf(scoreMatch[0])).trim();
  const afterScore  = rest.slice(rest.indexOf(scoreMatch[0]) + scoreMatch[0].length).trim();

  // beforeScore: "홈팀 [핸디] : 원정팀" — 팀구분자 ":"로 분리
  const colIdx = beforeScore.search(/[：:]/);
  let homeRaw = '', awayRaw = '';
  if (colIdx !== -1) {
    homeRaw = beforeScore.slice(0, colIdx).trim();
    awayRaw = beforeScore.slice(colIdx + 1).trim();
  } else {
    homeRaw = beforeScore;
    awayRaw = afterScore;
  }

  const { team: homeTeam, handicap } = splitTeamHandicap(homeRaw);

  return {
    gameNum,
    isBetTarget,
    marketType,       // 'H' | 'h' | 'U' | 'Uh' | 'Hh' | '1' | null
    rawHome: homeTeam,
    rawAway: awayRaw.trim(),
    handicap,
    pick: null,
    odds: null,
    score: { home: score.a, away: score.b },
    rawLine: line,
  };
}

function parseOcrLines(fullText) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const knownTeams = getKnownTeams();
  const results = [];

  // 푸터 키워드 등장 시 파싱 중단
  let footerReached = false;

  for (const line of lines) {
    if (footerReached) break;
    if (FOOTER_KEYWORDS.some(kw => line.includes(kw))) { footerReached = true; break; }

    // 결과 용지 행 시도 (스코어 포함)
    let row = parseResultRow(line);

    // 스코어 없으면 투표 용지 행(예상결과/배당 포함) 시도
    if (!row) row = parseProtoRow(line);

    if (!row) {
      // 경기번호 패턴이 있는데 파싱 실패한 경우만 warn
      // prefix 있는 경우(Hh*222, H 103 등)도 포함하도록 정규식 확장
      if (/^(?:Hh|Uh|H|h|U|1)?\s*\*?\d{3,4}\s/.test(line)) {
        console.warn('[OCR] 파싱 실패 라인 (alias/패턴 검토 필요):', JSON.stringify(line));
      }
      continue;
    }

    // 팀명 정규화
    const normHome = row.rawHome ? normalizeTeam(row.rawHome, knownTeams)
                                 : { team: '', confidence: 0, candidates: [], source: 'missing' };
    const normAway = row.rawAway ? normalizeTeam(row.rawAway, knownTeams)
                                 : { team: '', confidence: 0, candidates: [], source: 'missing' };

    results.push({
      rawLine:    row.rawLine,
      rawHome:    row.rawHome,
      rawAway:    row.rawAway,
      normHome,
      normAway,
      gameNum:    row.gameNum,      // 경기번호 — 매칭 최우선 키
      isSingleOk: row.isBetTarget,  // * = 단폴 구매 가능 경기
      marketType: row.marketType,   // 'H'|'h'|'U'|'Uh'|'Hh'|'1'|null — 베팅 마켓 구분
      handicap:   row.handicap,     // 핸디캡 수치 (있으면)
      pick:       row.pick,         // 예상결과 토큰 (투표 용지)
      odds:       row.odds,         // 배당률 (보조 식별자)
      score:      row.score || null,    // 결과 용지만 존재
      scorePairs: row.score ? [{ a: row.score.home, b: row.score.away }] : [],
    });
  }

  return results;
}

// ── 베팅 매칭 ──────────────────────────────────────────────────
function parseBetTeams(bet) {
  if (!bet.game || bet.game === '-') return null;
  const parts = bet.game.split(/\s+vs\s+|\s+VS\s+|\/|,/i);
  return {
    home: parts[0]?.trim() || '',
    away: parts[1]?.trim() || '',
  };
}

function dateProximityScore(betDate, imageDate) {
  if (!betDate || !imageDate) return 0.5;
  const msPerDay = 86400000;
  const diffDays = Math.abs(new Date(betDate) - new Date(imageDate)) / msPerDay;
  if (diffDays <= 1) return 1.0;
  if (diffDays <= 2) return 0.8;
  if (diffDays <= 3) return 0.6;
  return 0.2;
}

// 배당률 유사도 점수 (0~1) — 가중 평균에 사용
// 일치 범위 내면 1.0, 범위 밖이면 차이에 따라 선형 감쇠
function oddsScore(ocrOdds, betOdds) {
  if (ocrOdds == null || betOdds == null) return null; // 신호 없음 → 계산에서 제외
  const diff = Math.abs(ocrOdds - parseFloat(betOdds));
  if (diff <= ODDS_MATCH_TOL) return 1.0;
  // TOL~0.20 구간: 선형 감쇠 (0.20 이상이면 0)
  return Math.max(0, 1 - (diff - ODDS_MATCH_TOL) / 0.15);
}

// 하위 호환: 이진 일치 여부 (gameNum 교차 검증 등에서 사용)
function oddsMatches(ocrOdds, betOdds) {
  if (ocrOdds == null || betOdds == null) return false;
  return Math.abs(ocrOdds - parseFloat(betOdds)) <= ODDS_MATCH_TOL;
}

function matchBetToOcr(parsed, imageDate, ocrConf) {
  const bets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
  const pendingBets = bets.filter(b => b.result === 'PENDING');

  // 날짜 필터
  const dateCandidates = imageDate
    ? pendingBets.filter(b => {
        if (!b.date) return true;
        const diff = Math.abs(new Date(b.date) - new Date(imageDate)) / 86400000;
        return diff <= DATE_RANGE_DAYS;
      })
    : pendingBets;

  // OCR 엔진 신뢰도: 0~100 → 0~1
  const ocrQuality = typeof ocrConf === 'number'
    ? Math.max(0.3, ocrConf / 100)
    : 0.75;

  // ── 중복 매칭 방지 ────────────────────────────────────────────
  // OCR 행 여러 개가 동일 bet에 매칭되는 것을 막기 위한 1:1 보장
  // conflict 상태는 수동 확인 대상이므로 예약하지 않음
  const usedBetIds = new Set();

  // ── confidence 상한 캡 ────────────────────────────────────────
  // OCR 특성상 과신 방지 — 경로 A(번호매칭)도 포함
  const CONF_CAP = 0.95;

  const results = [];

  for (const p of parsed) {

    // ══ [경로 A] 경기번호 직접 매칭 ══════════════════════════
    if (p.gameNum) {
      // 이미 다른 행이 매칭한 bet은 제외
      const directBet = dateCandidates.find(
        b => b.gameNum === p.gameNum && !usedBetIds.has(b.id)
      );
      if (directBet) {
        const oddsOk = oddsMatches(p.odds, directBet.betmanOdds);

        // marketType 일치 확인
        const ocrMkt  = p.marketType;
        const betMkt  = normalizeBetMarketType(directBet.type);
        const mktExplicit = ocrMkt !== null && betMkt !== null;  // 양쪽 모두 명시됨
        const mktOk   = !mktExplicit || ocrMkt === betMkt;       // 둘 중 하나라도 null이면 관대

        // ── 강제 conflict 조건 ─────────────────────────────────
        // 배당 + 마켓 동시 불일치: 경기번호 하나만 믿고 auto 적용하면 오매칭 위험
        // 반드시 수동 확인 필요
        const hardConflict = !oddsOk && !mktOk;

        // auto 조건: 배당 OK AND (마켓 OK or 한쪽 미상)
        const isAuto = oddsOk && mktOk;

        const status = isAuto ? 'auto' : 'conflict';
        // hardConflict는 confidence도 낮춰서 UI에서 위험도를 구분할 수 있게
        const conf   = Math.min(
          isAuto       ? GAME_NUM_CONF :
          hardConflict ? 0.65          : 0.80,
          CONF_CAP
        );

        if (status === 'auto') usedBetIds.add(directBet.id);

        results.push({
          parsed:        p,
          matchedBet:    directBet,
          confidence:    conf,
          direction:     'normal',
          conflicts:     [],
          isAmbiguous:   false,
          _matchPath:    'gameNum',
          _oddsOk:       oddsOk,
          _oddsConflict: !oddsOk,
          _mktOk:        mktOk,
          _hardConflict: hardConflict,   // 배당+마켓 동시 불일치 플래그
          _ocrMkt:       ocrMkt,
          _betMkt:       betMkt,
          _top2Gap:      null,
          _hasDateSignal: !!(directBet.date && imageDate),
          status,
        });
        continue;
      }
    }

    // ══ [경로 B] 팀명 양방향 유사도 매칭 ════════════════════
    const scored = [];

    for (const bet of dateCandidates) {
      // 이미 확정 매칭된 bet은 후보에서 제외
      if (usedBetIds.has(bet.id)) continue;

      const betTeams = parseBetTeams(bet);
      if (!betTeams) continue;

      const teamSimFwd = (strSimilarity(p.normHome.team, betTeams.home) +
                          strSimilarity(p.normAway.team || '', betTeams.away)) / 2;
      const teamSimRev = (strSimilarity(p.normHome.team, betTeams.away) +
                          strSimilarity(p.normAway.team || '', betTeams.home)) / 2;

      const isReversed    = teamSimRev > teamSimFwd;
      const teamSim       = Math.max(teamSimFwd, teamSimRev);
      const datePx        = dateProximityScore(bet.date, imageDate);
      const teamNormConf  = (p.normHome.confidence + (p.normAway.confidence || 0.5)) / 2;
      const hasDateSignal = !!(bet.date && imageDate);

      const oScore   = oddsScore(p.odds, bet.betmanOdds);
      const teamSimWeighted = oScore != null
        ? teamSim * (1 - ODDS_WEIGHT) + oScore * ODDS_WEIGHT
        : teamSim;

      // ── marketType 유사도 반영 ─────────────────────────────
      // 동일 팀이라도 H(핸디) / h(전반) / Hh(전반핸디) / null(일반)은 다른 베팅.
      // mktScore 범위: 1.0(일치) / 0.5(둘다null) / 0.45(OCR無/bet有) / 0.35(OCR有/bet無) / 0.0(불일치)
      const betMkt   = normalizeBetMarketType(bet.type);
      const mktScore = marketTypeScore(p.marketType, betMkt);
      // mktOk: 0.35 이상이면 "용인 범위" (OCR有/bet無도 완전 차단은 아님)
      const mktOk    = mktScore >= 0.35;

      // MARKET_WEIGHT:
      //   - 양쪽 모두 명시(1.0/0.0): 15% 가중치
      //   - OCR有/bet無(0.35): 8% — bet 미등록일 수 있으므로 부드럽게
      //   - OCR無/bet有(0.45): 5% — OCR 미인식 가능성 높음, 거의 중립
      //   - 둘다null(0.5): 0% — 정보 없으면 가중치 제외
      const MARKET_WEIGHT =
        (p.marketType !== null && betMkt !== null) ? 0.15 :
        (p.marketType !== null && betMkt === null) ? 0.08 :
        (p.marketType === null && betMkt !== null) ? 0.05 : 0;

      const teamSimFinal = MARKET_WEIGHT > 0
        ? teamSimWeighted * (1 - MARKET_WEIGHT) + mktScore * MARKET_WEIGHT
        : teamSimWeighted;

      // 마켓 명시적 불일치(0.0)면 baseConf에 강한 페널티
      // OCR有/bet無(0.35)면 약한 페널티 — 완전 무시하지 않음 (피드백 #1)
      const mktPenalty =
        mktScore === 0.0  ? 0.55 :   // 명시적 불일치 → 강한 차단
        mktScore <= 0.35  ? 0.85 :   // OCR有/bet無 → 약한 제약
        1.0;                          // 그 외 → 페널티 없음

      const baseConf    = (teamSimFinal * 0.55 + datePx * 0.20 + teamNormConf * 0.25) * mktPenalty;
      const dateDecayed = hasDateSignal ? baseConf : baseConf * NO_DATE_DECAY;
      // ── confidence 상한 캡 적용 ───────────────────────────
      const finalConf   = Math.min(
        dateDecayed * (1 - OCR_CONF_WEIGHT) + ocrQuality * OCR_CONF_WEIGHT,
        CONF_CAP
      );

      scored.push({ bet, finalConf, isReversed, datePx, hasDateSignal, mktOk,
                    betMkt,  // UI 에서 불일치 강도 구분에 사용
                    oddsMatched: oScore != null && oScore >= 1.0 });
    }

    scored.sort((a, b) => b.finalConf - a.finalConf);

    const top1 = scored[0];
    const top2 = scored[1];

    const isAmbiguous = !!(top2 && (top1?.finalConf - top2.finalConf) < AMBIGUITY_GAP);

    let status, bestMatch, bestScore, bestDirection;

    if (!top1) {
      status = 'failed'; bestMatch = null; bestScore = 0; bestDirection = 'normal';

    } else if (isAmbiguous) {
      status        = top1.finalConf >= CONF_WARN ? 'ambiguous' : 'failed';
      bestMatch     = top1.finalConf >= CONF_WARN ? top1.bet : null;
      bestScore     = top1.finalConf;
      bestDirection = top1.isReversed ? 'reversed' : 'normal';

    } else {
      bestMatch     = top1.finalConf >= CONF_WARN ? top1.bet : null;
      bestScore     = top1.finalConf;
      bestDirection = top1.isReversed ? 'reversed' : 'normal';
      status        = bestScore >= CONF_AUTO ? 'auto'
                    : bestScore >= CONF_WARN ? 'warn'
                    : 'failed';
    }

    // auto/warn 확정 매칭은 usedBetIds에 등록해 이후 행에서 재사용 차단
    if (bestMatch && (status === 'auto' || status === 'warn')) {
      usedBetIds.add(bestMatch.id);
    }

    const conflicts = scored
      .filter(s => s !== top1 && s.finalConf >= CONF_WARN)
      .map(s => s.bet);

    results.push({
      parsed:      p,
      matchedBet:  bestMatch,
      confidence:  bestScore,
      direction:   bestDirection,
      conflicts,
      isAmbiguous,
      _matchPath:    'similarity',
      _oddsOk:       top1 ? top1.oddsMatched : false,
      _mktOk:        top1 ? top1.mktOk : true,
      _hardConflict: top1 ? (!top1.oddsMatched && !top1.mktOk) : false,
      _ocrMkt:       p.marketType,
      _betMkt:       top1 ? top1.betMkt : null,
      _top2Gap:      top2 ? +(top1.finalConf - top2.finalConf).toFixed(3) : null,
      _hasDateSignal: top1?.hasDateSignal ?? false,
      status,
    });
  }

  return results;
}

// ── 결과 적용 ──────────────────────────────────────────────────
function applyOcrResult(matchedItem, overrideScore) {
  const bets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
  const { matchedBet, parsed, direction } = matchedItem;
  if (!matchedBet) return false;

  // 투표 용지는 score가 없음 — overrideScore도 없으면 적용 불가
  const score = overrideScore || parsed.score;
  if (!score) return false;   // 스코어 없이 결과 판정 불가
  const idx   = bets.findIndex(b => b.id === matchedBet.id);
  if (idx === -1) return false;

  const bet  = bets[idx];
  const type = bet.type || 'winlose';

  // 홈/어웨이 방향 보정
  const homeScore = direction === 'reversed' ? score.away : score.home;
  const awayScore = direction === 'reversed' ? score.home : score.away;

  // 결과 판정
  let result = 'LOSE';
  if (type.includes('언') || type.includes('오버')) {
    const total = homeScore + awayScore;
    const line  = parseFloat(bet.handicap || 0);
    result = (type.includes('오버') ? total > line : total < line) ? 'WIN' : 'LOSE';
  } else if (type.includes('핸')) {
    const adj = homeScore + parseFloat(bet.handicap || 0);
    result = adj > awayScore ? 'WIN' : adj < awayScore ? 'LOSE' : 'PUSH';
  } else {
    // 승패
    if (homeScore > awayScore) result = bet.pick === 'HOME' || bet.pick === '홈' ? 'WIN' : 'LOSE';
    else if (homeScore < awayScore) result = bet.pick === 'AWAY' || bet.pick === '원정' ? 'WIN' : 'LOSE';
    else result = 'PUSH';
  }

  const profit = result === 'WIN'
    ? Math.round((bet.betmanOdds - 1) * bet.amount)
    : result === 'PUSH' ? 0
    : -bet.amount;

  bets[idx] = {
    ...bet,
    result,
    profit,
    ocrApplied: true,
    ocrScore: `${homeScore}-${awayScore}`,
    ocrDirection: direction,
    ocrConfidence: matchedItem.confidence,
  };

  localStorage.setItem('edge_bets', JSON.stringify(bets));
  return true;
}

// ── 피드백 루프: 팀명 수정 반영 ───────────────────────────────
function submitTeamCorrection(rawName, correctedName) {
  if (!rawName || !correctedName || rawName === correctedName) return;
  addAlias(rawName, correctedName);
}

// ============================================================
// UI — 모달 열기 / 전체 파이프라인
// ============================================================
function openOcrImport() {
  // 기존 모달 제거
  const existing = document.getElementById('ocr-import-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'ocr-import-modal';
  modal.innerHTML = `
    <div id="ocr-backdrop" style="
      position:fixed;inset:0;background:rgba(0,0,0,0.72);
      z-index:9000;display:flex;align-items:flex-start;justify-content:center;
      padding:16px;overflow-y:auto;
    ">
      <div style="
        background:var(--bg1,#0d1117);border:1px solid var(--border,#1e2a3a);
        border-radius:16px;width:100%;max-width:560px;
        box-shadow:0 24px 64px rgba(0,0,0,0.6);
        margin:auto;
      ">
        <!-- 헤더 -->
        <div style="
          padding:18px 20px 14px;
          border-bottom:1px solid var(--border,#1e2a3a);
          display:flex;align-items:center;justify-content:space-between;
        ">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text1,#e8f0fe);">
              📸 프로토 결과 사진 입력
            </div>
            <div style="font-size:11px;color:var(--text3,#546e7a);margin-top:2px;">
              OCR 반자동 결과 반영 시스템
            </div>
          </div>
          <button onclick="document.getElementById('ocr-import-modal').remove()"
            style="background:none;border:none;color:var(--text3,#546e7a);font-size:20px;cursor:pointer;padding:4px 8px;">✕</button>
        </div>

        <!-- 본문 -->
        <div style="padding:20px;" id="ocr-body">
          ${renderOcrStep1()}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 배경 클릭 닫기
  modal.querySelector('#ocr-backdrop').addEventListener('click', e => {
    if (e.target.id === 'ocr-backdrop') modal.remove();
  });
}

function renderOcrStep1() {
  return `
    <div style="text-align:center;padding:8px 0 20px;">
      <!-- 업로드 영역 -->
      <label for="ocr-file-input" id="ocr-drop-zone" style="
        display:block;border:2px dashed var(--border,#1e2a3a);border-radius:12px;
        padding:36px 20px;cursor:pointer;transition:border-color 0.2s;
        background:var(--bg2,#0f1923);
      " ondragover="event.preventDefault();this.style.borderColor='var(--accent,#00e5ff)'"
         ondragleave="this.style.borderColor='var(--border,#1e2a3a)'"
         ondrop="handleOcrDrop(event)">
        <div style="font-size:40px;margin-bottom:12px;">📷</div>
        <div style="font-size:14px;font-weight:600;color:var(--text2,#b0bec5);margin-bottom:6px;">
          사진을 여기에 드래그하거나 탭해서 선택
        </div>
        <div style="font-size:11px;color:var(--text3,#546e7a);">
          JPG / PNG / WEBP · 모바일 카메라 촬영 가능
        </div>
      </label>
      <input type="file" id="ocr-file-input" accept="image/*" capture="environment"
        style="display:none;" onchange="handleOcrFileSelect(this.files[0])">

      <!-- 날짜 입력 -->
      <div style="margin-top:16px;display:flex;align-items:center;gap:10px;justify-content:center;">
        <label style="font-size:12px;color:var(--text3,#546e7a);">경기 날짜 (선택)</label>
        <input type="date" id="ocr-date-input"
          value="${new Date().toISOString().split('T')[0]}"
          style="
            background:var(--bg2,#0f1923);border:1px solid var(--border,#1e2a3a);
            border-radius:6px;padding:5px 10px;color:var(--text2,#b0bec5);
            font-size:12px;
          ">
      </div>

      <!-- 처리 상태 -->
      <div id="ocr-progress" style="display:none;margin-top:20px;">
        <div style="
          height:4px;background:var(--bg3,#1a2332);border-radius:2px;overflow:hidden;margin-bottom:12px;
        ">
          <div id="ocr-progress-bar" style="
            height:100%;width:0%;background:var(--accent,#00e5ff);
            border-radius:2px;transition:width 0.4s ease;
          "></div>
        </div>
        <div id="ocr-progress-text" style="font-size:12px;color:var(--text3,#546e7a);">준비 중...</div>
      </div>
    </div>
  `;
}

function handleOcrDrop(e) {
  e.preventDefault();
  document.getElementById('ocr-drop-zone').style.borderColor = 'var(--border,#1e2a3a)';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleOcrFileSelect(file);
}

async function handleOcrFileSelect(file) {
  if (!file) return;

  const imageDate = document.getElementById('ocr-date-input')?.value || '';
  const progress  = document.getElementById('ocr-progress');
  const bar       = document.getElementById('ocr-progress-bar');
  const text      = document.getElementById('ocr-progress-text');

  if (progress) progress.style.display = 'block';

  const setProgress = (pct, msg) => {
    if (bar)  bar.style.width  = pct + '%';
    if (text) text.textContent = msg;
  };

  try {
    setProgress(10, '이미지 전처리 중...');
    const canvas = await preprocessImage(file);

    setProgress(25, 'OCR 엔진 로딩...');

    // Tesseract.js 동적 로드
    if (typeof Tesseract === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    setProgress(40, 'OCR 인식 중 (한글+영문)...');

    let ocrText = '';
    let ocrConf  = 0;

    // PSM.SPARSE_TEXT = 11 시도
    try {
      const r1 = await Tesseract.recognize(canvas, 'kor+eng', {
        tessedit_pageseg_mode: '11',
      });
      ocrText = r1.data.text;
      ocrConf  = r1.data.confidence;
    } catch {
      // fallback: SINGLE_COLUMN = 4
      const r2 = await Tesseract.recognize(canvas, 'kor+eng', {
        tessedit_pageseg_mode: '4',
      });
      ocrText = r2.data.text;
      ocrConf  = r2.data.confidence;
    }

    setProgress(70, '스코어 + 팀명 파싱 중...');

    const parsed  = parseOcrLines(ocrText);
    const matched = matchBetToOcr(parsed, imageDate, ocrConf);

    // ── 라인 수 불일치 검증 ──────────────────────────────────
    // 경기번호 패턴이 있는 원문 라인 수를 파싱 결과와 비교
    const rawGameLines = ocrText.split('\n')
      .map(l => l.trim())
      .filter(l => /^\*?\d{3,4}\s/.test(l) &&
                   !FOOTER_KEYWORDS.some(kw => l.includes(kw)));
    const parsedCount  = parsed.length;
    const rawCount     = rawGameLines.length;
    const lineCountMismatch = rawCount > 0 && parsedCount < rawCount;

    if (lineCountMismatch) {
      console.warn(`[OCR] 라인 수 불일치: 원문 경기행 ${rawCount}개 → 파싱 성공 ${parsedCount}개`);
    }

    setProgress(90, '미리보기 생성 중...');

    renderOcrPreview(matched, ocrText, ocrConf, imageDate, lineCountMismatch, rawCount, parsedCount);

    setProgress(100, '완료');

  } catch(err) {
    console.error('[OCR]', err);
    renderOcrError(err.message);
  }
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── 미리보기 렌더링 ────────────────────────────────────────────
function renderOcrPreview(matchedList, rawText, ocrConf, imageDate,
                          lineCountMismatch = false, rawCount = 0, parsedCount = 0) {
  const body = document.getElementById('ocr-body');
  if (!body) return;

  if (!matchedList.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:32px 16px;">
        <div style="font-size:36px;margin-bottom:12px;">🔍</div>
        <div style="font-size:13px;color:var(--text2,#b0bec5);margin-bottom:8px;">
          스코어를 찾을 수 없습니다
        </div>
        <div style="font-size:11px;color:var(--text3,#546e7a);margin-bottom:16px;">
          사진을 더 선명하게 찍거나, 밝은 곳에서 다시 시도해보세요.
        </div>
        ${renderRawOcrText(rawText)}
        <button onclick="document.getElementById('ocr-import-modal').remove()"
          style="margin-top:16px;padding:10px 24px;background:var(--bg3,#1a2332);
                 border:1px solid var(--border,#1e2a3a);border-radius:8px;
                 color:var(--text2,#b0bec5);cursor:pointer;font-size:13px;">닫기</button>
      </div>`;
    return;
  }

  const autoCount     = matchedList.filter(m => m.status === 'auto').length;
  const warnCount     = matchedList.filter(m => m.status === 'warn').length;
  const ambiCount     = matchedList.filter(m => m.status === 'ambiguous').length;
  const conflictCount = matchedList.filter(m => m.status === 'conflict').length;
  const failCount     = matchedList.filter(m => m.status === 'failed').length;

  // 기본적으로 auto는 체크, warn/fail은 미체크
  const checkedSet = new Set(matchedList.filter(m => m.status === 'auto').map((_, i) =>
    matchedList.findIndex(x => x === matchedList.filter(m2 => m2.status === 'auto')[i])
  ));

  body.innerHTML = `
    ${lineCountMismatch ? `
    <!-- 라인 수 불일치 경고 -->
    <div style="
      display:flex;align-items:flex-start;gap:8px;
      padding:9px 12px;margin-bottom:12px;
      background:rgba(255,152,0,0.08);border:1px solid rgba(255,152,0,0.35);
      border-radius:8px;font-size:11px;color:#ff9800;
    ">
      <span style="flex-shrink:0;font-size:14px;">⚠️</span>
      <div>
        <strong>경기 누락 가능</strong> — 원문에서 경기행 <strong>${rawCount}개</strong> 감지됐으나
        파싱 성공 <strong>${parsedCount}개</strong>만 추출됐습니다.
        <span style="color:var(--text3,#546e7a);">
          (OCR 오인식으로 경기번호 형식이 깨진 행이 있을 수 있습니다. OCR 원문을 확인하세요.)
        </span>
      </div>
    </div>` : ''}

    <!-- 요약 배지 -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
                   background:rgba(0,230,118,0.15);color:var(--green,#00e676);border:1px solid rgba(0,230,118,0.3);">
        ✅ 자동 ${autoCount}건
      </span>
      <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
                   background:rgba(255,152,0,0.15);color:#ff9800;border:1px solid rgba(255,152,0,0.3);">
        ⚠️ 확인필요 ${warnCount}건
      </span>
      ${ambiCount ? `<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
                   background:rgba(180,100,255,0.15);color:#b464ff;border:1px solid rgba(180,100,255,0.3);">
        🔀 중복후보 ${ambiCount}건
      </span>` : ''}
      ${conflictCount ? `<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
                   background:rgba(255,82,82,0.15);color:#ff5252;border:1px solid rgba(255,82,82,0.3);">
        🚨 배당불일치 ${conflictCount}건
      </span>` : ''}
      <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
                   background:rgba(255,82,82,0.15);color:var(--red,#ff5252);border:1px solid rgba(255,82,82,0.3);">
        ❌ 실패 ${failCount}건
      </span>
      <span style="margin-left:auto;padding:4px 10px;border-radius:20px;font-size:11px;
                   background:var(--bg3,#1a2332);color:var(--text3,#546e7a);">
        OCR 신뢰도 ${Math.round(ocrConf)}%
      </span>
    </div>

    <!-- 매칭 목록 -->
    <div id="ocr-match-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
      ${matchedList.map((m, idx) => renderMatchCard(m, idx)).join('')}
    </div>

    <!-- OCR 원문 토글 -->
    ${renderRawOcrText(rawText)}

    <!-- 하단 버튼 -->
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button onclick="document.getElementById('ocr-import-modal').remove()"
        style="flex:1;padding:12px;background:var(--bg3,#1a2332);
               border:1px solid var(--border,#1e2a3a);border-radius:10px;
               color:var(--text2,#b0bec5);cursor:pointer;font-size:13px;font-weight:600;">
        취소
      </button>
      <button onclick="applyCheckedOcrResults()"
        style="flex:2;padding:12px;background:var(--accent,#00e5ff);
               border:none;border-radius:10px;
               color:#000;cursor:pointer;font-size:13px;font-weight:700;">
        ✅ 체크된 항목 적용
      </button>
    </div>
  `;

  // matchedList를 전역에 저장 (apply 시 참조)
  window._ocrMatchedList = matchedList;
}

function renderMatchCard(m, idx) {
  const { parsed, matchedBet, confidence, direction, status, conflicts,
          isAmbiguous, _top2Gap, _hasDateSignal, _matchPath, _oddsOk,
          _oddsConflict, _mktOk, _hardConflict, _ocrMkt, _betMkt } = m;
  // ── confidence 단위 normalize ─────────────────────────────
  const _confNorm = confidence > 1 ? confidence / 100 : confidence;
  const confPct = Math.round(_confNorm * 100);

  const statusColor = status === 'auto'      ? 'var(--green,#00e676)'
                    : status === 'warn'      ? '#ff9800'
                    : status === 'ambiguous' ? '#b464ff'
                    : status === 'conflict'  ? '#ff5252'   // 번호 맞음 + 배당 불일치
                    : 'var(--red,#ff5252)';
  const statusIcon  = status === 'auto'      ? '✅'
                    : status === 'warn'      ? '⚠️'
                    : status === 'ambiguous' ? '🔀'
                    : status === 'conflict'  ? '🚨'
                    : '❌';
  const statusLabel = status === 'auto'      ? '자동 가능'
                    : status === 'warn'      ? '확인 필요'
                    : status === 'ambiguous' ? '중복 후보'
                    : status === 'conflict'  ? (_hardConflict ? '마켓+배당 불일치' : '배당 불일치')
                    : '매칭 실패';
  const isChecked = status === 'auto';

  // ── 매칭 경로 배지 (경기번호 vs 유사도) ──────────────────
  const matchPathBadge = _matchPath === 'gameNum'
    ? `<span style="font-size:9px;padding:2px 6px;border-radius:8px;
                    background:rgba(0,229,255,0.12);color:var(--accent,#00e5ff);margin-left:4px;">
        #${parsed.gameNum} 번호매칭
       </span>`
    : (parsed.gameNum
        ? `<span style="font-size:9px;padding:2px 6px;border-radius:8px;
                        background:rgba(255,152,0,0.12);color:#ff9800;margin-left:4px;">
            #${parsed.gameNum} — bet 미등록
           </span>`
        : '');

  // ── 배당 일치 배지 ────────────────────────────────────────
  const oddsBadge = _oddsOk
    ? `<span style="font-size:9px;padding:2px 6px;border-radius:8px;
                    background:rgba(0,230,118,0.12);color:var(--green,#00e676);margin-left:4px;">
        배당 ✓ ${parsed.odds ?? ''}
       </span>`
    : (parsed.odds != null
        ? `<span style="font-size:9px;padding:2px 6px;border-radius:8px;
                        background:rgba(255,82,82,0.10);color:var(--red,#ff5252);margin-left:4px;">
            배당 불일치 ${parsed.odds}
           </span>`
        : '');

  // ── 단폴 가능 배지 ────────────────────────────────────────
  const singleBadge = parsed.isSingleOk
    ? `<span style="font-size:9px;padding:2px 6px;border-radius:8px;
                    background:rgba(0,229,255,0.08);color:var(--accent,#00e5ff);margin-left:4px;">
        단폴 가능
       </span>`
    : '';

  // ── 마켓 타입 배지 ────────────────────────────────────────
  // OCR에서 추출한 marketType을 항상 표시 (null이면 '일반 승부식')
  const mktInfo = MARKET_PREFIX_MAP[parsed.marketType];
  const mktLabel = mktInfo ? mktInfo.label : '일반 승부식';
  const mktColor = parsed.marketType
    ? (parsed.marketType.startsWith('H') ? '#ff9800'   // 핸디 계열 → 주황
     : parsed.marketType === 'h'         ? '#64b5f6'   // 전반 → 파랑
     : parsed.marketType.startsWith('U') ? '#ce93d8'   // 언오버 계열 → 보라
     : parsed.marketType === '1'         ? '#a5d6a7'   // 핸디결과 → 연두
     : '#90a4ae')
    : '#546e7a';  // 일반 → 회색

  const marketTypeBadge = `
    <span style="font-size:9px;padding:2px 7px;border-radius:8px;
                 background:${mktColor}22;color:${mktColor};margin-left:4px;
                 font-weight:700;letter-spacing:0.3px;"
          title="베팅 마켓: ${mktLabel}">
      ${parsed.marketType ? parsed.marketType + ' · ' : ''}${mktLabel}
    </span>
  `;

  // 마켓 불일치 경고 — 2단계 강도 구분 (피드백 #4)
  // 🟠 강한 불일치: OCR과 bet 양쪽에 타입이 있는데 다름 → 오매칭 고위험
  // 🟡 약한 불일치: 한쪽만 타입 있음 → OCR 미인식 or bet 미등록 가능성
  const betMktLabel = _betMkt ? (MARKET_PREFIX_MAP[_betMkt]?.label ?? _betMkt) : null;
  const mktConflictBanner = (() => {
    if (_mktOk !== false) return '';  // 일치 or 중립 → 배너 없음

    const bothExplicit = _ocrMkt && _betMkt && _ocrMkt !== _betMkt;

    if (bothExplicit) {
      // 🟠 강한 불일치
      return `<div style="font-size:10px;color:#ff6d00;margin-top:5px;padding:6px 8px;
                          background:rgba(255,109,0,0.10);border-radius:6px;
                          border:1px solid rgba(255,109,0,0.40);">
        🟠 <strong>마켓 타입 강한 불일치</strong>
        — OCR <strong>${mktLabel}</strong> vs bet <strong>${betMktLabel}</strong>
        <br><span style="font-size:9px;color:var(--text3,#546e7a);">
          동일 경기번호라도 마켓이 다른 별개 베팅입니다. 수동 확인 필수.
          ${_hardConflict ? ' · <span style="color:#ff5252;">배당도 동시 불일치 — 매우 높은 위험</span>' : ''}
        </span>
      </div>`;
    } else {
      // 🟡 약한 불일치 (한쪽 null)
      const reason = _ocrMkt && !_betMkt
        ? `OCR: <strong>${mktLabel}</strong> / bet에 마켓 타입 미등록`
        : `bet: <strong>${betMktLabel}</strong> / OCR에서 prefix 미인식`;
      return `<div style="font-size:10px;color:#ffd54f;margin-top:5px;padding:5px 8px;
                          background:rgba(255,213,79,0.07);border-radius:6px;
                          border:1px solid rgba(255,213,79,0.25);">
        🟡 <strong>마켓 타입 부분 불일치</strong> — ${reason}
        <br><span style="font-size:9px;color:var(--text3,#546e7a);">
          OCR 미인식이거나 bet 등록 시 타입 누락 가능. 확인 권장.
        </span>
      </div>`;
    }
  })();

  const betInfo = matchedBet
    ? `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px;">
        <span style="font-size:10px;color:var(--text3,#546e7a);">${matchedBet.date || '날짜미상'} · ${matchedBet.sport || ''}</span>
        ${marketTypeBadge}${matchPathBadge}${oddsBadge}${singleBadge}
       </div>`
    : `<div style="
        font-size:11px;color:var(--red,#ff5252);
        margin-top:4px;padding:5px 8px;
        background:rgba(255,82,82,0.08);border-radius:6px;
        border:1px solid rgba(255,82,82,0.25);
       ">
        ❌ 매칭 실패 — 수동 확인 필요
        <span style="font-size:10px;color:var(--text3,#546e7a);margin-left:4px;">
          (베팅 목록에 해당 경기가 없거나 확신도 ${confPct}%로 기준 미달)
        </span>
       </div>`;

  const directionBadge = direction === 'reversed'
    ? `<span style="font-size:10px;padding:2px 6px;border-radius:10px;
                    background:rgba(255,152,0,0.2);color:#ff9800;margin-left:6px;">
        🔄 홈/원정 반전 감지
       </span>`
    : '';

  // ambiguous 전용 경고
  const ambiguousBadge = isAmbiguous
    ? `<div style="font-size:10px;color:#b464ff;margin-top:5px;padding:5px 8px;
                   background:rgba(180,100,255,0.10);border-radius:6px;border:1px solid rgba(180,100,255,0.25);">
        🔀 유사도 근접 후보 존재 (1위-2위 차이: ${_top2Gap != null ? (_top2Gap*100).toFixed(1)+'%p' : '—'})
        — 아래 <strong>직접 선택</strong>으로 경기를 확인하세요
       </div>`
    : '';

  // 번호 매칭됐으나 배당 불일치 경고
  const oddsConflictBanner = _oddsConflict
    ? `<div style="font-size:10px;color:#ff5252;margin-top:5px;padding:6px 8px;
                   background:rgba(255,82,82,0.08);border-radius:6px;
                   border:1px solid rgba(255,82,82,0.30);">
        🚨 경기번호 #${parsed.gameNum} 매칭됐으나 <strong>배당 불일치</strong>
        — OCR 오인식이거나 bet 배당이 변경됐을 수 있습니다. 수동 확인 필요.
        <br><span style="font-size:9px;color:var(--text3,#546e7a);">
          용지 배당: ${parsed.odds ?? '—'} / bet 저장 배당: ${matchedBet?.betmanOdds ?? '—'}
        </span>
       </div>`
    : '';

  const noDateWarn = !_hasDateSignal
    ? `<span style="font-size:9px;padding:2px 6px;border-radius:8px;
                    background:rgba(255,82,82,0.12);color:var(--red,#ff5252);margin-left:5px;">
        📅 날짜 미확인
       </span>`
    : '';

  const conflictWarn = (conflicts.length || isAmbiguous)
    ? `<div style="font-size:10px;color:#ff9800;margin-top:4px;">
        ⚠️ 유사한 경기 ${Math.max(conflicts.length, isAmbiguous ? 1 : 0)}건 —
        <a href="#" onclick="showConflictPicker(${idx});return false;"
          style="color:#ff9800;text-decoration:underline;">직접 선택</a>
       </div>`
    : '';

  const teamNormInfo = `
    <div style="font-size:10px;color:var(--text3,#546e7a);margin-top:3px;">
      인식: "${parsed.rawHome}"${parsed.handicap != null ? ` <span style="color:#ff9800;">[핸디 ${parsed.handicap > 0 ? '+' : ''}${parsed.handicap}]</span>` : ''}
      → <strong style="color:var(--text2,#b0bec5);">${parsed.normHome.team}</strong>
      ${parsed.normHome.confidence < 1.0 ? `(${Math.round(parsed.normHome.confidence*100)}%)` : ''}
      ${parsed.rawAway ? `&nbsp;vs&nbsp;"${parsed.rawAway}" → <strong style="color:var(--text2,#b0bec5);">${parsed.normAway.team}</strong>` : ''}
    </div>
  `;

  // 스코어 수정 입력 (결과 용지에만 표시 — score가 없으면 숨김)
  const scoreEdit = parsed.score ? `
    <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
      <span style="font-size:11px;color:var(--text3,#546e7a);">스코어:</span>
      <input type="number" id="ocr-score-home-${idx}" min="0" max="30"
             value="${parsed.score.home}"
             style="width:44px;text-align:center;background:var(--bg3,#1a2332);
                    border:1px solid var(--border,#1e2a3a);border-radius:6px;
                    padding:4px;color:var(--text1,#e8f0fe);font-size:13px;font-weight:700;">
      <span style="color:var(--text3,#546e7a);">:</span>
      <input type="number" id="ocr-score-away-${idx}" min="0" max="30"
             value="${parsed.score.away}"
             style="width:44px;text-align:center;background:var(--bg3,#1a2332);
                    border:1px solid var(--border,#1e2a3a);border-radius:6px;
                    padding:4px;color:var(--text1,#e8f0fe);font-size:13px;font-weight:700;">
      <span style="font-size:10px;color:var(--text3,#546e7a);">홈 : 원정</span>
      ${directionBadge}
    </div>
  ` : `<div style="font-size:10px;color:var(--text3,#546e7a);margin-top:6px;">
        📋 투표 용지 — 스코어 미포함 (결과 반영 시 수동 입력 필요)
       </div>`;

  // 팀명 수정 (confidence 낮을 때만 표시)
  const teamCorrect = (parsed.normHome.confidence < SIMILARITY_AUTO || !parsed.rawAway) ? `
    <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;">
      <span style="font-size:10px;color:var(--text3,#546e7a);">팀명 보정:</span>
      <input type="text" id="ocr-team-home-${idx}"
             value="${parsed.normHome.team}" placeholder="홈팀명"
             style="width:90px;background:var(--bg3,#1a2332);border:1px solid var(--border,#1e2a3a);
                    border-radius:6px;padding:4px 6px;color:var(--text1,#e8f0fe);font-size:11px;">
      ${parsed.rawAway ? `
      <span style="color:var(--text3);">vs</span>
      <input type="text" id="ocr-team-away-${idx}"
             value="${parsed.normAway.team}" placeholder="원정팀명"
             style="width:90px;background:var(--bg3,#1a2332);border:1px solid var(--border,#1e2a3a);
                    border-radius:6px;padding:4px 6px;color:var(--text1,#e8f0fe);font-size:11px;">
      ` : ''}
    </div>` : '';

  return `
    <div style="
      background:var(--bg2,#0f1923);border:1px solid ${statusColor}44;
      border-left:3px solid ${statusColor};border-radius:10px;padding:12px 14px;
    ">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <!-- 체크박스 — conflict는 수동 확인 필수이므로 disabled -->
        <input type="checkbox" id="ocr-check-${idx}"
               ${isChecked && matchedBet ? 'checked' : ''}
               ${(!matchedBet || isAmbiguous || status === 'conflict') ? 'disabled' : ''}
               style="margin-top:3px;accent-color:var(--accent,#00e5ff);width:16px;height:16px;flex-shrink:0;">

        <div style="flex:1;min-width:0;">
          <!-- 상태 + 확신도 -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:12px;">${statusIcon}</span>
            <span style="font-size:12px;font-weight:700;color:var(--text2,#b0bec5);">
              ${matchedBet ? (matchedBet.game || '경기명 없음') : parsed.normHome.team + (parsed.rawAway ? ' vs ' + parsed.normAway.team : '')}
            </span>
            <span style="
              font-size:10px;font-weight:700;
              padding:2px 7px;border-radius:10px;
              background:${statusColor}22;color:${statusColor};
            ">${statusLabel} · ${confPct}%</span>
            ${noDateWarn}
          </div>

          ${betInfo}
          ${teamNormInfo}
          ${ambiguousBadge}
          ${oddsConflictBanner}
          ${mktConflictBanner}
          ${scoreEdit}
          ${teamCorrect}
          ${conflictWarn}
        </div>
      </div>
    </div>
  `;
}

function renderRawOcrText(text) {
  const escaped = text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <details style="margin-top:12px;">
      <summary style="font-size:11px;color:var(--text3,#546e7a);cursor:pointer;user-select:none;">
        🔤 OCR 원문 보기
      </summary>
      <pre style="
        margin-top:8px;padding:10px;background:var(--bg3,#1a2332);
        border-radius:8px;font-size:10px;color:var(--text3,#546e7a);
        white-space:pre-wrap;word-break:break-all;max-height:160px;overflow-y:auto;
      ">${escaped}</pre>
    </details>
  `;
}

function renderOcrError(msg) {
  const body = document.getElementById('ocr-body');
  if (!body) return;
  body.innerHTML = `
    <div style="text-align:center;padding:32px 16px;">
      <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
      <div style="font-size:13px;color:var(--red,#ff5252);margin-bottom:8px;">OCR 처리 실패</div>
      <div style="font-size:11px;color:var(--text3,#546e7a);margin-bottom:16px;">${msg}</div>
      <button onclick="document.getElementById('ocr-import-modal').remove()"
        style="padding:10px 24px;background:var(--bg3,#1a2332);border:1px solid var(--border,#1e2a3a);
               border-radius:8px;color:var(--text2,#b0bec5);cursor:pointer;">닫기</button>
    </div>`;
}

// ── 결과 일괄 적용 ─────────────────────────────────────────────
function applyCheckedOcrResults() {
  const list = window._ocrMatchedList;
  if (!list) return;

  let applied = 0, skipped = 0;

  list.forEach((m, idx) => {
    const checkbox = document.getElementById(`ocr-check-${idx}`);
    if (!checkbox || !checkbox.checked) { skipped++; return; }
    if (!m.matchedBet) {
      // 매칭 실패 — 사용자에게 이유 표시 (토스트가 아닌 카드에 반영되어 있으나
      // skipped 집계에 포함시켜 완료 토스트에서 건너뜀 이유를 알 수 있게 함)
      skipped++;
      return;
    }

    // ── [Fix 1] betId 기준 재조회 ──────────────────────────────
    // conflict 픽커로 matchedBet이 교체된 경우 list[idx] 참조는 최신이지만,
    // applyOcrResult 내부에서 bets.findIndex(b => b.id === matchedBet.id)로
    // 재조회하므로 stale 문제는 없음.
    // 단, selectConflictBet이 list[idx].matchedBet을 직접 교체하므로
    // 여기서 한 번 더 localStorage에서 신선한 bet 객체를 가져와 교체한다.
    {
      const freshBets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
      const freshBet  = freshBets.find(b => b.id === m.matchedBet.id);
      if (freshBet) m.matchedBet = freshBet;  // stale 필드 방지
    }

    // 사용자가 수정한 스코어 읽기
    const homeInput = document.getElementById(`ocr-score-home-${idx}`);
    const awayInput = document.getElementById(`ocr-score-away-${idx}`);
    const overrideScore = (homeInput && awayInput)
      ? { home: parseInt(homeInput.value) || 0, away: parseInt(awayInput.value) || 0 }
      : null;

    // 팀명 수정 피드백 루프
    const homeNameInput = document.getElementById(`ocr-team-home-${idx}`);
    const awayNameInput = document.getElementById(`ocr-team-away-${idx}`);
    if (homeNameInput && homeNameInput.value !== m.parsed.normHome.team) {
      submitTeamCorrection(m.parsed.rawHome, homeNameInput.value);
    }
    if (awayNameInput && awayNameInput.value !== m.parsed.normAway?.team) {
      submitTeamCorrection(m.parsed.rawAway, awayNameInput.value);
    }

    const ok = applyOcrResult(m, overrideScore);
    if (ok) applied++; else skipped++;
  });

  document.getElementById('ocr-import-modal')?.remove();

  // 기존 시스템 업데이트
  if (typeof updateAll === 'function') updateAll();
  if (typeof updateBetList === 'function') updateBetList();

  // 완료 토스트
  showOcrToast(applied, skipped);
}

function showOcrToast(applied, skipped) {
  const t = document.createElement('div');
  t.innerHTML = `
    <div style="
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:var(--bg2,#0f1923);border:1px solid var(--border,#1e2a3a);
      border-left:4px solid var(--green,#00e676);
      border-radius:10px;padding:12px 20px;z-index:9999;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
      font-size:13px;color:var(--text1,#e8f0fe);
      display:flex;align-items:center;gap:10px;
    ">
      <span style="font-size:20px;">✅</span>
      <div>
        <strong>${applied}건 반영 완료</strong>
        ${skipped ? `<span style="font-size:11px;color:var(--text3,#546e7a);margin-left:6px;">(${skipped}건 건너뜀)</span>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── 충돌 픽커 (동일 날짜 복수 경기) ───────────────────────────
function showConflictPicker(idx) {
  const m = window._ocrMatchedList?.[idx];
  if (!m || !m.conflicts.length) return;

  const all = [m.matchedBet, ...m.conflicts].filter(Boolean);
  const picker = document.createElement('div');
  picker.id = 'ocr-conflict-picker';
  picker.innerHTML = `
    <div style="
      position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9100;
      display:flex;align-items:center;justify-content:center;padding:16px;
    " onclick="if(event.target===this)this.remove()">
      <div style="
        background:var(--bg1,#0d1117);border:1px solid var(--border,#1e2a3a);
        border-radius:12px;width:100%;max-width:380px;padding:20px;
      ">
        <div style="font-size:14px;font-weight:700;color:var(--text2,#b0bec5);margin-bottom:14px;">
          중복 경기 선택
        </div>
        ${all.map((b, i) => `
          <div onclick="selectConflictBet(${idx}, '${b.id}');document.getElementById('ocr-conflict-picker').remove()"
            style="
              padding:10px 12px;border-radius:8px;border:1px solid var(--border,#1e2a3a);
              cursor:pointer;margin-bottom:8px;background:var(--bg2,#0f1923);
            ">
            <div style="font-size:12px;font-weight:600;color:var(--text2,#b0bec5);">${b.game || '—'}</div>
            <div style="font-size:10px;color:var(--text3,#546e7a);">${b.date || ''} · ${b.sport || ''}</div>
          </div>
        `).join('')}
        <button onclick="document.getElementById('ocr-conflict-picker').remove()"
          style="width:100%;margin-top:8px;padding:9px;background:var(--bg3,#1a2332);
                 border:1px solid var(--border,#1e2a3a);border-radius:8px;
                 color:var(--text2,#b0bec5);cursor:pointer;font-size:12px;">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(picker);
}

function selectConflictBet(idx, betId) {
  const list = window._ocrMatchedList;
  if (!list || !list[idx]) return;
  const bets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
  const bet  = bets.find(b => b.id === betId);
  if (bet) {
    list[idx].matchedBet   = bet;
    list[idx].status       = 'warn';   // ambiguous → warn으로 강등
    list[idx].isAmbiguous  = false;    // ambiguity 해제
    list[idx].confidence   = Math.max(list[idx].confidence, 0.80);
    // 카드 재렌더
    const matchList = document.getElementById('ocr-match-list');
    if (matchList) {
      const cards = matchList.querySelectorAll(':scope > div');
      if (cards[idx]) cards[idx].outerHTML = renderMatchCard(list[idx], idx);
    }
    // 체크 활성화
    const cb = document.getElementById(`ocr-check-${idx}`);
    if (cb) { cb.disabled = false; cb.checked = true; }
  }
}
