// ============================================================
// verify_ocr_patch.js — verify.js ↔ ocr_import.js 연결 패치
// ============================================================
// 이 파일을 verify.js 하단에 붙여넣거나 별도 로드하세요.
// ocr_import.js 이후에 로드되어야 합니다.
// ============================================================

// ── OCR 입력 확신도를 verify 요약에 추가 ─────────────────────
// renderVerifySummary 완료 후 호출됩니다.
function renderOcrConfidenceSummary() {
  const el = document.getElementById('verify-summary');
  if (!el) return;

  const bets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
  const ocrBets = bets.filter(b => b.ocrApplied && b.ocrConfidence != null);
  if (!ocrBets.length) return;

  const avgConf    = ocrBets.reduce((s,b) => s + b.ocrConfidence, 0) / ocrBets.length;
  const autoCount  = ocrBets.filter(b => b.ocrConfidence >= 0.90).length;
  const warnCount  = ocrBets.filter(b => b.ocrConfidence >= 0.70 && b.ocrConfidence < 0.90).length;
  const failCount  = ocrBets.filter(b => b.ocrConfidence < 0.70).length;

  // 뒤집힘 감지 통계
  const reversedCount = ocrBets.filter(b => b.ocrDirection === 'reversed').length;

  const card = document.createElement('div');
  card.style.cssText = `
    padding:14px;background:var(--bg2);border-radius:8px;
    border:1px solid var(--border);margin-bottom:12px;
  `;
  card.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;">
      📸 OCR 입력 신뢰도 통계
      <span style="font-weight:400;color:var(--text3);font-size:10px;margin-left:6px;">${ocrBets.length}건 OCR 반영됨</span>
    </div>

    <!-- 신뢰도 바 -->
    <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin-bottom:10px;gap:1px;">
      <div style="width:${(autoCount/ocrBets.length*100).toFixed(0)}%;background:var(--green);"></div>
      <div style="width:${(warnCount/ocrBets.length*100).toFixed(0)}%;background:#ff9800;"></div>
      <div style="width:${(failCount/ocrBets.length*100).toFixed(0)}%;background:var(--red);"></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">
      <div style="padding:8px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:var(--green);">${autoCount}</div>
        <div style="font-size:10px;color:var(--text3);">자동 (90%+)</div>
      </div>
      <div style="padding:8px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#ff9800;">${warnCount}</div>
        <div style="font-size:10px;color:var(--text3);">확인 후 반영</div>
      </div>
      <div style="padding:8px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:var(--red);">${failCount}</div>
        <div style="font-size:10px;color:var(--text3);">수동 입력</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);padding:0 2px;">
      <span>평균 확신도: <strong style="color:${avgConf>=0.9?'var(--green)':avgConf>=0.7?'#ff9800':'var(--red)'};">${(avgConf*100).toFixed(0)}%</strong></span>
      ${reversedCount ? `<span>🔄 홈/원정 반전 감지: <strong style="color:#ff9800;">${reversedCount}건</strong></span>` : ''}
    </div>

    <!-- 인사이트 -->
    <div style="margin-top:10px;padding:8px;background:var(--bg3);border-radius:6px;font-size:10px;color:var(--text3);line-height:1.7;">
      💡 OCR 확신도와 보정도(ECE)는 별개의 신뢰도 레이어입니다.
      &nbsp;OCR 확신도 = <strong style="color:var(--text2);">입력 정확도</strong>
      &nbsp;·&nbsp;ECE = <strong style="color:var(--text2);">예측 정확도</strong>
      &nbsp;·&nbsp;둘 다 높아야 분석 신뢰도가 올라갑니다.
    </div>
  `;

  // verify-summary 상단에 삽입
  el.insertBefore(card, el.firstChild);
}

// ── renderVerifyPage 후킹 ─────────────────────────────────────
// 기존 renderVerifyPage를 래핑해서 OCR 섹션 자동 추가
(function patchRenderVerifyPage() {
  const original = window.renderVerifyPage;
  if (typeof original !== 'function') return;

  window.renderVerifyPage = function() {
    original();
    // 약간의 딜레이 후 OCR 섹션 추가 (차트 렌더 완료 후)
    setTimeout(renderOcrConfidenceSummary, 50);
  };
})();

// ── 개별 베팅 OCR 신뢰도 뱃지 (bet_record.js 연동용) ─────────
// 베팅 목록 테이블에서 ocrApplied 베팅에 뱃지 표시
function getOcrBadgeHtml(bet) {
  if (!bet.ocrApplied) return '';
  const conf = bet.ocrConfidence || 0;
  const color = conf >= 0.90 ? 'var(--green)' : conf >= 0.70 ? '#ff9800' : 'var(--red)';
  const icon  = conf >= 0.90 ? '📸' : '📸⚠️';
  return `<span title="OCR 반영 (확신도 ${(conf*100).toFixed(0)}%)"
    style="font-size:9px;padding:1px 5px;border-radius:8px;
           background:${color}22;color:${color};border:1px solid ${color}44;
           margin-left:4px;">${icon} OCR</span>`;
}
