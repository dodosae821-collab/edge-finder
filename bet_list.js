// ============================================================
// ui/bet_list.js
// 담당: 베팅 목록 렌더링 / 페이지네이션 / 필터
//
// 역할: 데이터를 받아서 화면에 그리는 레이어
//
// 의존 (전역 — 허용):
//   getBets(), bets (state.js)
//   escHtml, sportClass (bet_record.js)
//   window._SS (전역 상태)
// 금지:
//   saveBets(), localStorage.setItem/getItem
// ============================================================

function toggleRecordDetail(id) {
  const row = document.getElementById('record-detail-' + id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}


function toggleFolderMemoRow(id) {
  const row = document.getElementById('fmemo-row-' + id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}


function renderTemplateList() {
  const el = document.getElementById('template-list');
  if (!el) return;
  if (betTemplates.length === 0) {
    el.innerHTML = '<span style="font-size:10px;color:var(--text3);">저장된 템플릿 없음</span>';
    return;
  }
  el.innerHTML = betTemplates.map(t => `
    <div style="display:flex;align-items:center;gap:2px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:3px 7px;font-size:10px;">
      <span style="cursor:pointer;color:var(--text2);" onclick="loadBetTemplate(${t.id})">${escHtml(t.label)}</span>
      <span style="cursor:pointer;color:var(--text3);margin-left:3px;font-size:9px;" onclick="deleteBetTemplate(${t.id})">✕</span>
    </div>`).join('');
}


let recordPage = 1;
const RECORD_PAGE_SIZE = 12;
let recordFiltered = null;

let kellyPage = 1;
const KELLY_PAGE_SIZE = 12;
let kellyRows = [];


function getRecordFiltered() {
  const filterSport  = (document.getElementById('filter-sport')  || {}).value || 'ALL';
  const filterResult = (document.getElementById('filter-result') || {}).value || 'ALL';
  const filterDateEl = document.getElementById('filter-daterange');
  const filterDate   = filterDateEl ? filterDateEl.value : 'ALL';
  const filterFolder = (document.getElementById('filter-folder') || {}).value || 'ALL';

  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  function inDateRange(dateStr) {
    if (filterDate === 'ALL' || !dateStr) return true;
    const d = new Date(dateStr);
    if (filterDate === '7')         return (now - d) <= 7  * 86400000;
    if (filterDate === '30')        return (now - d) <= 30 * 86400000;
    if (filterDate === '90')        return (now - d) <= 90 * 86400000;
    if (filterDate === 'thismonth') return dateStr.slice(0,7) === today.slice(0,7);
    if (filterDate === 'lastmonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return dateStr.slice(0,7) === lm.toISOString().slice(0,7);
    }
    return true;
  }

  return [...bets].reverse().filter(b =>
    (filterSport  === 'ALL' || (b.sport || '').includes(filterSport)) &&
    (filterResult === 'ALL' || b.result === filterResult) &&
    (filterFolder === 'ALL' ||
      (filterFolder === 'single' && b.mode !== 'multi') ||
      (filterFolder === '2' && b.mode === 'multi' && (b.folderCount === '2' || b.folderCount === 2)) ||
      (filterFolder === '3' && b.mode === 'multi' && (b.folderCount === '3' || b.folderCount === 3)) ||
      (filterFolder === '4' && b.mode === 'multi' && (b.folderCount === '4+' || parseInt(b.folderCount) >= 4))
    ) &&
    inDateRange(b.date)
  );
}


function goRecordPage(dir) {
  const totalPages = Math.ceil(recordFiltered.length / RECORD_PAGE_SIZE) || 1;
  if (dir === 'first') recordPage = 1;
  else if (dir === 'prev')  recordPage = Math.max(1, recordPage - 1);
  else if (dir === 'next')  recordPage = Math.min(totalPages, recordPage + 1);
  else if (dir === 'last')  recordPage = totalPages;
  renderTablePage();
}


function goKellyPage(dir) {
  const totalPages = Math.ceil(kellyRows.length / KELLY_PAGE_SIZE) || 1;
  if (dir === 'prev') kellyPage = Math.max(1, kellyPage - 1);
  else if (dir === 'next') kellyPage = Math.min(totalPages, kellyPage + 1);
  renderKellyPage();
}


function renderKellyPage() {
  const totalPages = Math.ceil(kellyRows.length / KELLY_PAGE_SIZE) || 1;
  kellyPage = Math.min(kellyPage, totalPages);
  const infoEl = document.getElementById('kelly-page-info');
  const numEl  = document.getElementById('kelly-page-num');
  if (infoEl) infoEl.textContent = kellyRows.length > 0 ? `전체 ${kellyRows.length}건` : '기록이 없습니다';
  if (numEl)  numEl.textContent  = `${kellyPage} / ${totalPages}`;
  const tableEl = document.getElementById('kelly-hist-table');
  if (!tableEl) return;
  if (kellyRows.length === 0) {
    tableEl.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">EV+ 베팅 기록이 없습니다</td></tr>';
    return;
  }
  const start = (kellyPage - 1) * KELLY_PAGE_SIZE;
  tableEl.innerHTML = kellyRows.slice(start, start + KELLY_PAGE_SIZE).join('');
}


function updateRecordSportFilter() {
  const sel = document.getElementById('filter-sport');
  if (!sel) return;
  const current = sel.value;
  const sports = [...new Set(bets.map(b => b.sport).filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">전체 종목</option>';
  sports.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (s === current) opt.selected = true;
    sel.appendChild(opt);
  });
}


function renderTable() {
  updateRecordSportFilter();
  recordFiltered = getRecordFiltered();
  // 필터 바뀌면 1페이지로 리셋
  recordPage = 1;
  renderTablePage();
}

// 실제 폴더 수 반환 — 4+폴은 folderOdds 길이로 판단

function actualFolderCount(b) {
  // 반환값은 숫자 문자열만 허용 — 화이트리스트로 강제
  if (b.folderOdds && b.folderOdds.length >= 2) return String(parseInt(b.folderOdds.length) || '');
  const fc = String(b.folderCount || '');
  const allowed = ['2','3','4','4+','5','6','7','8'];
  return allowed.includes(fc) ? fc : '';
}


function renderTablePage() {
  // recordFiltered가 설정되지 않은 경우에만 재계산 (null/undefined 체크)
  if (recordFiltered === null || recordFiltered === undefined) recordFiltered = getRecordFiltered();
  const filtered = recordFiltered;
  const tbody = document.getElementById('record-table');
  if (!tbody) return;
  const totalPages = Math.ceil(filtered.length / RECORD_PAGE_SIZE) || 1;
  recordPage = Math.min(recordPage, totalPages);

  const infoEl = document.getElementById('record-page-info');
  const numEl  = document.getElementById('record-page-num');
  if (infoEl) infoEl.textContent = filtered.length > 0 ? `전체 ${filtered.length}건` : '기록이 없습니다';
  if (numEl)  numEl.textContent  = `${recordPage} / ${totalPages}`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px;">기록이 없습니다.</td></tr>';
    return;
  }

  const start    = (recordPage - 1) * RECORD_PAGE_SIZE;
  const pageData = filtered.slice(start, start + RECORD_PAGE_SIZE);

  tbody.innerHTML = '';
  pageData.forEach((b, i) => {
    const rowNum = (recordPage - 1) * RECORD_PAGE_SIZE + i + 1;
    const profit = b.profit || 0;
    const profitColor = profit > 0 ? 'var(--green)' : profit < 0 ? 'var(--red)' : 'var(--text2)';
    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">적중</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">미적중</span>'
      : b.mode === 'multi'
      ? `<div style="display:flex;gap:3px;">
           <button class="btn btn-sm" style="background:rgba(0,230,118,0.2);color:var(--green);border:1px solid var(--green);padding:2px 6px;font-size:10px;" onclick="resolvebet(${b.id},'WIN')">전체적중</button>
           <button class="btn btn-sm" style="background:rgba(255,59,92,0.2);color:var(--red);border:1px solid var(--red);padding:2px 6px;font-size:10px;" onclick="openFolderResultModal(${b.id})">미적중</button>
         </div>`
      : `<div style="display:flex;gap:3px;">
           <button class="btn btn-sm" style="background:rgba(0,230,118,0.2);color:var(--green);border:1px solid var(--green);padding:2px 6px;font-size:10px;" onclick="resolvebet(${b.id},'WIN')">적중</button>
           <button class="btn btn-sm" style="background:rgba(255,59,92,0.2);color:var(--red);border:1px solid var(--red);padding:2px 6px;font-size:10px;" onclick="resolvebet(${b.id},'LOSE')">미적중</button>
         </div>`;
    const modeBadge = b.mode === 'multi'
      ? `<span class="badge badge-hot" style="cursor:pointer;" onclick="toggleRecordDetail(${b.id})">다폴${actualFolderCount(b)} ▾</span>`
      : '<span class="badge badge-neutral">단폴</span>';

    // 다폴더 상세 행 생성
    let detailRow = '';
    // ── Decision 로그 뱃지 (null-safe: 과거 베팅 호환) ───────
    const dec = b.decision || {};  // 기존 데이터에 decision 없으면 빈 객체
    const decFactor  = dec.factor  ?? 1.0;
    const decAllow   = dec.allow   ?? true;
    const decReason  = dec.reason  ?? 'LEGACY';
    const decAdjProb = dec.adjustedProb ?? b.myProb;   // % 단위
    const decAdjDelta = dec.adjustDelta ?? 0;
    const decRecentEce = dec.recentEce ?? null;

    const decBadge = (dec.reason && dec.reason !== 'LEGACY')
      ? (() => {
          const color = decAllow === false ? 'var(--red)'
            : decFactor < 0.5 ? 'var(--red)'
            : decFactor < 1.0 ? '#ff9800'
            : 'var(--green)';
          const icon  = decAllow === false ? '🚫' : decFactor < 1.0 ? '⚠️' : '✅';
          const adjStr = decAdjDelta && Math.abs(decAdjDelta) > 0.3
            ? ` <span style="color:${decAdjDelta < 0 ? 'var(--red)' : 'var(--green)'};font-size:9px;">(${decAdjDelta > 0 ? '+' : ''}${decAdjDelta.toFixed(1)}%보정)</span>`
            : '';
          const eceStr = decRecentEce != null ? decRecentEce.toFixed(1) + '%' : 'N/A';
          // decReason: b.decision.reason 경유 — 사용자 입력으로 간주, title/텍스트 모두 escHtml
          // decFactor: 숫자값이지만 저장 데이터 경유 — Number() 강제 변환 후 toFixed
          const safeReason = escHtml(String(decReason));
          const safeFactor = Number.isFinite(Number(decFactor)) ? Number(decFactor).toFixed(2) : '?';
          return `<span title="Decision: ${safeReason} | Kelly×${safeFactor} | recentEce:${eceStr}"
            style="font-size:9px;padding:1px 5px;border-radius:8px;background:${color}22;color:${color};border:1px solid ${color}44;margin-left:4px;white-space:nowrap;">
            ${icon} ×${safeFactor}${adjStr}</span>`;
        })()
      : '';

    if (b.mode === 'multi' && b.folderOdds && b.folderOdds.length > 0) {
      const sports  = (b.sport || '').split(', ');
      const types   = (b.type  || '').split(', ');
      const memos   = b.folderMemos || [];
      const folders = b.folderOdds.map((odds, fi) => {
        // sp, tp, memo — 사용자 입력 → escHtml 적용 (B: HTML 구조 필요)
        const sp   = escHtml((b.folderSports && b.folderSports[fi]) || sports[fi] || sports[0] || '—');
        const tp   = escHtml(types[fi] || types[0] || '—');
        const fr   = b.folderResults && b.folderResults[fi];
        const memo = memos[fi] ? escHtml(memos[fi]) : '';
        const frBadge = fr === 'WIN'
          ? '<span style="color:var(--green);font-size:10px;font-weight:700;">✅</span>'
          : fr === 'LOSE'
          ? '<span style="color:var(--red);font-size:10px;font-weight:700;">❌</span>'
          : '<span style="color:var(--text3);font-size:10px;">—</span>';
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--bg2);border-radius:5px;font-size:11px;">
          <span style="color:var(--text3);font-weight:700;min-width:22px;">F${fi+1}</span>
          <span style="color:var(--accent);font-weight:600;">${sp}</span>
          <span style="color:var(--text3);">${tp}</span>
          <span style="color:var(--text2);font-family:'JetBrains Mono',monospace;">${odds || '—'}배</span>
          ${frBadge}
          ${memo ? `<span style="color:var(--text3);font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📝 ${memo}</span>` : ''}
        </div>`;
      }).join('');
      detailRow = `<tr id="record-detail-${b.id}" style="display:none;">
        <td colspan="8" style="padding:4px 8px 8px 28px;background:var(--bg1);">
          <div style="display:flex;flex-direction:column;gap:3px;">${folders}</div>
        </td>
      </tr>`;
    }

    // 메인 행 — 사용자 입력 필드는 createElement + textContent로 구성
    const tr = document.createElement('tr');

    // td1: 번호 (C — 내부 생성 숫자)
    const tdNum = document.createElement('td');
    tdNum.style.fontSize = '10px';
    tdNum.style.color = 'var(--text3)';
    tdNum.textContent = rowNum;
    tr.appendChild(tdNum);

    // td2: 날짜 (A — textContent)
    const tdDate = document.createElement('td');
    tdDate.style.fontSize = '11px';
    tdDate.textContent = b.date || '—';
    tr.appendChild(tdDate);

    // td3: 모드 배지 (C — 고정 템플릿)
    const tdMode = document.createElement('td');
    tdMode.innerHTML = modeBadge;
    tr.appendChild(tdMode);

    // td4: 경기명 (A — textContent + title 속성, decBadge는 B)
    const tdGame = document.createElement('td');
    tdGame.style.cssText = 'font-size:10px;color:var(--text3);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    tdGame.title = (b.game && b.game !== '-') ? b.game : '';  // title은 브라우저가 텍스트로 처리
    tdGame.textContent = (b.game && b.game !== '-') ? b.game : '—';
    if (decBadge) {
      const decSpan = document.createElement('span');
      decSpan.innerHTML = decBadge; // decBadge는 코드 내부 생성값 (사용자 입력 없음)
      tdGame.appendChild(decSpan);
    }
    tr.appendChild(tdGame);

    // td5: 배당 (C — 숫자)
    const tdOdds = document.createElement('td');
    tdOdds.className = 'mono';
    tdOdds.textContent = b.betmanOdds || '—';
    tr.appendChild(tdOdds);

    // td6: 결과 배지 (C — 고정 템플릿)
    const tdResult = document.createElement('td');
    tdResult.innerHTML = resultBadge;
    tr.appendChild(tdResult);

    // td7: 수익 (B — 색상은 코드 생성, 숫자만)
    const tdProfit = document.createElement('td');
    tdProfit.style.color = profitColor;
    tdProfit.style.fontFamily = "'JetBrains Mono',monospace";
    tdProfit.textContent = (profit >= 0 ? '+' : '') + '₩' + Math.round(profit).toLocaleString();
    tr.appendChild(tdProfit);

    // td8: 액션 버튼 (C — b.id는 숫자, onclick에 사용자 입력 없음)
    const tdActions = document.createElement('td');
    tdActions.style.whiteSpace = 'nowrap';
    tdActions.innerHTML = `
      <button class="btn btn-sm" style="background:rgba(0,229,255,0.1);color:var(--accent);border:1px solid rgba(0,229,255,0.3);font-size:10px;padding:3px 7px;margin-right:3px;" onclick="copyBet('${b.id}')">수정</button>
      <button class="btn btn-sm" style="background:rgba(0,230,118,0.1);color:var(--green);border:1px solid rgba(0,230,118,0.3);font-size:10px;padding:3px 7px;margin-right:3px;" onclick="duplicateBet('${b.id}')">복사</button>
      <button class="btn btn-sm" style="color:var(--red);border:1px solid rgba(255,59,92,0.3);background:rgba(255,59,92,0.08);font-size:10px;padding:3px 7px;" onclick="deleteBet('${b.id}')">삭제</button>`;
    tr.appendChild(tdActions);

    tbody.appendChild(tr);

    if (detailRow) {
      const detailTr = document.createElement('template');
      detailTr.innerHTML = detailRow;
      tbody.appendChild(detailTr.content.firstElementChild);
    }
  });
}

// ========== VAULT — 기록 보관함 ==========

let vaultPage = 1;
const VAULT_PAGE_SIZE = 12;
let vaultFiltered = [];


function getVaultFiltered() {
  const fSport  = (document.getElementById('vault-filter-sport')  || {}).value || 'ALL';
  const fResult = (document.getElementById('vault-filter-result') || {}).value || 'ALL';
  const fFolder = (document.getElementById('vault-filter-folder') || {}).value || 'ALL';
  const fDate   = (document.getElementById('vault-filter-date')   || {}).value || 'ALL';
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  function inRange(dateStr) {
    if (fDate === 'ALL' || !dateStr) return true;
    const d = new Date(dateStr);
    if (fDate === '7')         return (now - d) <= 7  * 86400000;
    if (fDate === '30')        return (now - d) <= 30 * 86400000;
    if (fDate === '90')        return (now - d) <= 90 * 86400000;
    if (fDate === 'thismonth') return dateStr.slice(0,7) === today.slice(0,7);
    if (fDate === 'lastmonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return dateStr.slice(0,7) === lm.toISOString().slice(0,7);
    }
    return true;
  }
  return [...bets].reverse().filter(b => {
    const sportMatch = fSport === 'ALL'
      || (b.sport || '').includes(fSport)
      || (b.folderSports && b.folderSports.some(s => s === fSport));
    return sportMatch &&
      (fResult === 'ALL' || b.result === fResult) &&
      (fFolder === 'ALL' ||
        (fFolder === 'single' && b.mode !== 'multi') ||
        (fFolder !== 'single' && b.mode === 'multi' && b.folderCount === fFolder)
      ) &&
      inRange(b.date);
  });
}


function goVaultPage(dir) {
  const total = Math.ceil(vaultFiltered.length / VAULT_PAGE_SIZE) || 1;
  if (dir === 'first') vaultPage = 1;
  else if (dir === 'prev') vaultPage = Math.max(1, vaultPage - 1);
  else if (dir === 'next') vaultPage = Math.min(total, vaultPage + 1);
  else if (dir === 'last') vaultPage = total;
  renderVaultPage();
}


function renderVault() {
  vaultFiltered = getVaultFiltered();
  vaultPage = 1;
  renderVaultPage();
}


function renderVaultPage() {
  const tbody = document.getElementById('vault-table');
  if (!tbody) return;
  const total = Math.ceil(vaultFiltered.length / VAULT_PAGE_SIZE) || 1;
  vaultPage = Math.min(vaultPage, total);

  const infoEl = document.getElementById('vault-page-info');
  const numEl  = document.getElementById('vault-page-num');
  if (infoEl) infoEl.textContent = vaultFiltered.length > 0 ? `전체 ${vaultFiltered.length}건 · 페이지당 ${VAULT_PAGE_SIZE}개` : '기록이 없습니다';
  if (numEl)  numEl.textContent  = `${vaultPage} / ${total}`;

  if (vaultFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:24px;">기록이 없습니다.</td></tr>';
    return;
  }

  const start    = (vaultPage - 1) * VAULT_PAGE_SIZE;
  const pageData = vaultFiltered.slice(start, start + VAULT_PAGE_SIZE);

  tbody.innerHTML = '';
  pageData.forEach((b, i) => {
    const rowNum = (vaultPage - 1) * VAULT_PAGE_SIZE + i + 1;
    const profitColor = b.profit > 0 ? 'var(--green)' : b.profit < 0 ? 'var(--red)' : 'var(--text2)';
    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">적중</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">미적중</span>'
      : '<span class="badge badge-neutral">미결</span>';
    const modeBadge = b.mode === 'multi'
      ? `<span class="badge badge-hot">다폴${actualFolderCount(b)}</span>`
      : '<span class="badge badge-neutral">단폴</span>';
    const hasFolderMemos = b.folderMemos && b.folderMemos.some(m => m && m.trim());
    const hasSingleMemo  = b.mode === 'single' && b.memo && b.memo.trim();
    const hasMemo = hasSingleMemo || hasFolderMemos;
    // memo — 사용자 입력 → escHtml 적용 (& 포함 5종 완전 처리)
    const memoContent = hasSingleMemo
      ? escHtml(b.memo)
      : hasFolderMemos
      ? b.folderMemos.map((m,i) => m ? `<b style="color:var(--text3);font-size:10px;">F${i+1}</b> ${escHtml(m)}`:'').filter(Boolean).join('<br>')
      : '';
    const memoCell = hasMemo
      ? `<div onclick="toggleVaultMemo(this)" style="cursor:pointer;" class="vault-memo-cell">
           <div class="vault-memo-short" style="font-size:11px;color:var(--text3);">📝 메모 보기</div>
           <div class="vault-memo-full" style="display:none;font-size:12px;color:var(--text2);line-height:1.6;white-space:pre-wrap;padding:6px 8px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:6px;margin-top:4px;">${memoContent}</div>
         </div>`
      : '<span style="color:var(--text3);">—</span>';
    // vault 행 — 사용자 입력 필드는 createElement + textContent
    const tr = document.createElement('tr');

    const tdNum = document.createElement('td');
    tdNum.style.cssText = 'font-size:10px;color:var(--text3);';
    tdNum.textContent = rowNum;
    tr.appendChild(tdNum);

    const tdDate = document.createElement('td');
    tdDate.style.cssText = 'font-size:11px;white-space:nowrap;';
    tdDate.textContent = b.date || '—';
    tr.appendChild(tdDate);

    const tdMode = document.createElement('td');
    tdMode.innerHTML = modeBadge;
    tr.appendChild(tdMode);

    // game (A — textContent)
    const tdGame = document.createElement('td');
    tdGame.style.cssText = 'font-size:11px;color:var(--text3);';
    tdGame.textContent = (b.game && b.game !== '-') ? b.game : '—';
    tr.appendChild(tdGame);

    // sport (A — textContent)
    const tdSport = document.createElement('td');
    tdSport.style.fontSize = '11px';
    tdSport.textContent = b.sport || '—';
    tr.appendChild(tdSport);

    // type (A — textContent)
    const tdType = document.createElement('td');
    tdType.style.fontSize = '11px';
    tdType.textContent = b.type || '—';
    tr.appendChild(tdType);

    const tdOdds = document.createElement('td');
    tdOdds.className = 'mono';
    tdOdds.textContent = b.betmanOdds || '—';
    tr.appendChild(tdOdds);

    const tdAmount = document.createElement('td');
    tdAmount.style.fontFamily = "'JetBrains Mono',monospace";
    tdAmount.textContent = '₩' + (b.amount||0).toLocaleString();
    tr.appendChild(tdAmount);

    const tdResult = document.createElement('td');
    tdResult.innerHTML = resultBadge;
    tr.appendChild(tdResult);

    const tdProfit = document.createElement('td');
    tdProfit.style.color = profitColor;
    tdProfit.style.fontFamily = "'JetBrains Mono',monospace";
    tdProfit.textContent = (b.profit >= 0 ? '+' : '') + '₩' + Math.round(b.profit||0).toLocaleString();
    tr.appendChild(tdProfit);

    // memo (B — innerHTML 허용, memoContent는 escHtml 적용 완료)
    const tdMemo = document.createElement('td');
    tdMemo.innerHTML = memoCell;
    tr.appendChild(tdMemo);

    tbody.appendChild(tr);
  });
}

function toggleVaultMemo(el) {
  const short = el.querySelector('.vault-memo-short');
  const full  = el.querySelector('.vault-memo-full');
  const isOpen = full.style.display !== 'none';
  full.style.display = isOpen ? 'none' : 'block';
  short.textContent  = isOpen ? '📝 메모 보기' : '📝 접기';
  short.style.color  = isOpen ? 'var(--text3)' : 'var(--gold)';
}


let predPage = 1;
let predAllBets = [];
const PRED_PAGE_SIZE = 12;


function goPredPage(dir) {
  const total = Math.ceil(predAllBets.length / PRED_PAGE_SIZE) || 1;
  if (dir === 'first') predPage = 1;
  else if (dir === 'prev') predPage = Math.max(1, predPage - 1);
  else if (dir === 'next') predPage = Math.min(total, predPage + 1);
  else if (dir === 'last') predPage = total;
  renderPredPage();
}


function renderPredPage() {
  const tbody  = document.getElementById('pred-table');
  const infoEl = document.getElementById('pred-page-info');
  const numEl  = document.getElementById('pred-page-num');
  const total  = Math.ceil(predAllBets.length / PRED_PAGE_SIZE) || 1;
  predPage = Math.min(predPage, total);

  if (infoEl) infoEl.textContent = predAllBets.length > 0 ? `전체 ${predAllBets.length}건` : '데이터 없음';
  if (numEl)  numEl.textContent  = `${predPage} / ${total}`;

  if (!predAllBets.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">예상 승률을 입력한 베팅 기록이 없습니다</td></tr>`;
    return;
  }

  const start    = (predPage - 1) * PRED_PAGE_SIZE;
  const pageData = predAllBets.slice(start, start + PRED_PAGE_SIZE);

  tbody.innerHTML = '';
  pageData.forEach((b, i) => {
    const rowNum = (predPage - 1) * PRED_PAGE_SIZE + i + 1;
    const impliedProb = (1 / b.betmanOdds * 100).toFixed(1);
    const edge = (b.myProb - parseFloat(impliedProb)).toFixed(1);
    const edgeColor = parseFloat(edge) >= 0 ? 'var(--green)' : 'var(--red)';
    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">적중</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">미적중</span>'
      : '<span class="badge badge-neutral">미결</span>';
    // pred 행 — b.sport, b.date 사용자 입력 → textContent
    const tr = document.createElement('tr');

    const tdNum = document.createElement('td');
    tdNum.style.cssText = 'font-size:10px;color:var(--text3);';
    tdNum.textContent = rowNum;
    tr.appendChild(tdNum);

    const tdDate = document.createElement('td');
    tdDate.style.cssText = 'font-size:10px;white-space:nowrap;';
    tdDate.textContent = b.date || '—';
    tr.appendChild(tdDate);

    const tdSport = document.createElement('td');
    tdSport.style.fontSize = '10px';
    tdSport.textContent = (b.sport || '—').slice(0, 8);
    tr.appendChild(tdSport);

    const tdOdds = document.createElement('td');
    tdOdds.className = 'mono';
    tdOdds.style.fontSize = '11px';
    tdOdds.textContent = b.betmanOdds.toFixed(2);
    tr.appendChild(tdOdds);

    const tdImplied = document.createElement('td');
    tdImplied.className = 'mono';
    tdImplied.style.fontSize = '11px';
    tdImplied.textContent = impliedProb + '%';
    tr.appendChild(tdImplied);

    const tdMyProb = document.createElement('td');
    tdMyProb.className = 'mono';
    tdMyProb.style.cssText = 'font-size:11px;color:var(--accent2);';
    tdMyProb.textContent = b.myProb.toFixed(1) + '%';
    tr.appendChild(tdMyProb);

    const tdEdge = document.createElement('td');
    tdEdge.className = 'mono';
    tdEdge.style.cssText = 'font-size:11px;color:' + edgeColor + ';';
    tdEdge.textContent = (parseFloat(edge) >= 0 ? '+' : '') + edge + '%p';
    tr.appendChild(tdEdge);

    const tdResult = document.createElement('td');
    tdResult.innerHTML = resultBadge;
    tr.appendChild(tdResult);

    tbody.appendChild(tr);
  });
}

// ========== 피보나치 손실 만회 시스템 ==========

function updateDashboardKPI() {
  const SS  = window.App._SS;
  const kpi = computeDashboardKPI(SS);
  if (!kpi) return;

  const { totalBets, winRate, totalProfit, totalInvested, roi, avgOdds, valueWinRate, oddsCount } = kpi;
  const _scope = typeof getCurrentScope === 'function' ? getCurrentScope() : 'all';
  const isRound = _scope === 'round';

  function _set(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (cls !== undefined) el.className = cls;
  }

  // ── Header (항상 현재 scope 기준) ──
  _set('h-total-bets', totalBets);
  _set('h-win-rate', `${winRate.toFixed(1)}%`);
  _set('h-profit',
    `${totalProfit >= 0 ? '+₩' : '-₩'}${Math.abs(Math.round(totalProfit)).toLocaleString()}`,
    `hstat-val ${totalProfit >= 0 ? 'positive' : 'negative'}`);
  _set('h-roi',
    `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
    `hstat-val ${roi >= 0 ? 'positive' : 'negative'}`);

  if (!isRound) {
    // ── 전체 scope 카드 ──
    // 전체 투자금액
    _set('d-total-invested',
      totalInvested > 0 ? '₩' + Math.round(totalInvested).toLocaleString() : '—');
    // 누적 손익
    _set('d-profit',
      `${totalProfit >= 0 ? '+₩' : '-₩'}${Math.abs(Math.round(totalProfit)).toLocaleString()}`,
      `stat-val ${totalProfit >= 0 ? 'green' : 'red'}`);
    // 전체 평균 배당
    _set('d-avg-odds', avgOdds > 0 ? avgOdds.toFixed(2) : '—');
    _set('d-avg-odds-label', oddsCount > 0 ? `${oddsCount}건 평균` : '결과 있는 베팅 기준');
    // 전체 밸류 적중률
    _set('d-value-winrate', `${valueWinRate.toFixed(1)}%`);
    const _dvf = document.getElementById('d-value-fill');
    if (_dvf) _dvf.style.width = `${valueWinRate}%`;
    // 전체 ROI
    _set('d-roi',
      `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
      `stat-val ${roi >= 0 ? 'green' : 'red'}`);
    _set('d-roi-note', totalBets > 0 ? `${totalBets}경기 기준` : '베팅 기록을 추가하세요');
  } else {
    // ── 현재 회차 scope 카드 ──
    // 이번 회차 손익 (journal.js의 d-round-profit과 별개로 KPI도 업데이트)
    // 누적 손익 (전체 기준 — SS가 round scope이면 전체 SS를 별도 계산)
    const allBets = getBets();
    const allResolved = allBets.filter(b => b.result === 'WIN' || b.result === 'LOSE');
    const allProfit = allResolved.reduce((s, b) => s + (b.profit || 0), 0);
    _set('d-round-cumul-profit',
      `${allProfit >= 0 ? '+₩' : '-₩'}${Math.abs(Math.round(allProfit)).toLocaleString()}`,
      `stat-val ${allProfit >= 0 ? 'green' : 'red'}`);
    // 이번 회차 평균 배당
    _set('d-round-avg-odds', avgOdds > 0 ? avgOdds.toFixed(2) : '—');
    _set('d-round-avg-odds-label', oddsCount > 0 ? `${oddsCount}건 평균` : '이번 회차 기준');
    // 이번 회차 밸류 적중률
    _set('d-round-value-winrate', `${valueWinRate.toFixed(1)}%`);
    const _rvf = document.getElementById('d-round-value-fill');
    if (_rvf) _rvf.style.width = `${valueWinRate}%`;
    // 이번 회차 ROI
    _set('d-round-roi',
      `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
      `stat-val ${roi >= 0 ? 'green' : 'red'}`);
    _set('d-round-roi-note', totalBets > 0 ? `${totalBets}경기 기준` : '베팅 기록을 추가하세요');
  }
}


function renderRecentTable() {
  const tbody = document.getElementById('recent-table');
  if (!tbody) return;

  // _SS가 null이면 직접 getBetsByScope()로 계산 (새로고침 후 초기 렌더 안전 처리)
  const SS = window.App._SS;
  const scopedBets  = typeof getBetsByScope === 'function' ? getBetsByScope() : getBets();
  const resolved    = SS ? SS.resolved : scopedBets.filter(b => b.result !== 'PENDING');
  const pendingBets = scopedBets.filter(b => b.result === 'PENDING');
  const recent      = computeRecentRows(resolved, pendingBets, 8);
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:24px;">베팅 기록이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  recent.forEach(b => {
    const isPending = b.result === 'PENDING';
    const profitColor = b.profit > 0 ? 'var(--green)' : b.profit < 0 ? 'var(--red)' : 'var(--text2)';

    const tr = document.createElement('tr');
    if (isPending) {
      tr.style.background = 'rgba(0,229,255,0.04)';
      tr.style.borderLeft = '2px solid rgba(0,229,255,0.4)';
    }

    // td1: 날짜 (A — textContent)
    const tdDate = document.createElement('td');
    tdDate.textContent = b.date || '—';
    tr.appendChild(tdDate);

    // td2: 경기명 (A — textContent, isValue 아이콘은 고정 텍스트)
    const tdGame = document.createElement('td');
    if (b.isValue) tdGame.appendChild(document.createTextNode('⚡ '));
    tdGame.appendChild(document.createTextNode(b.game && b.game !== '-' ? b.game : '—'));
    tr.appendChild(tdGame);

    // td3: 종목 (B — span 구조 필요, sportClass enum + textContent)
    const tdSport = document.createElement('td');
    const sportSpan = document.createElement('span');
    sportSpan.className = 'tag tag-' + sportClass(b.sport);
    sportSpan.textContent = b.sport || '—';
    tdSport.appendChild(sportSpan);
    tr.appendChild(tdSport);

    // td4: 타입 (A — textContent, class는 고정 화이트리스트)
    const tdType = document.createElement('td');
    if (b.type === 'UNDER') tdType.className = 'under';
    else if (b.type === 'OVER') tdType.className = 'over';
    tdType.textContent = b.type || '—';
    tr.appendChild(tdType);

    // td5: 배당 (C — 숫자, 사용자 입력 아님)
    const tdOdds = document.createElement('td');
    tdOdds.textContent = b.betmanOdds || '—';
    tr.appendChild(tdOdds);

    // td6: EV (B — 색상 span 구조 필요, 숫자만 삽입)
    const tdEv = document.createElement('td');
    if (b.ev !== undefined && b.ev !== null) {
      const evSpan = document.createElement('span');
      evSpan.style.color = b.ev > 0 ? 'var(--green)' : 'var(--red)';
      evSpan.style.fontWeight = '700';
      evSpan.textContent = (b.ev > 0 ? '+' : '') + (b.ev * 100).toFixed(1) + '%';
      tdEv.appendChild(evSpan);
    } else if (b.isValue) {
      const evSpan = document.createElement('span');
      evSpan.style.color = 'var(--accent)';
      evSpan.style.fontSize = '10px';
      evSpan.textContent = 'EV+';
      tdEv.appendChild(evSpan);
    } else {
      tdEv.textContent = '—';
    }
    tr.appendChild(tdEv);

    // td7: 금액 (C — 숫자)
    const tdAmount = document.createElement('td');
    tdAmount.textContent = '₩' + b.amount.toLocaleString();
    tr.appendChild(tdAmount);

    // td8: 결과 배지 (C — 고정 템플릿, 사용자 입력 없음)
    const tdResult = document.createElement('td');
    if (b.result === 'WIN') {
      tdResult.innerHTML = '<span class="badge badge-value">✓</span>';
    } else if (b.result === 'LOSE') {
      tdResult.innerHTML = '<span class="badge badge-novalue">✗</span>';
    } else {
      tdResult.innerHTML = '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:rgba(0,229,255,0.1);color:var(--accent);border:1px solid rgba(0,229,255,0.3);">🔄 진행중</span>';
    }
    tr.appendChild(tdResult);

    // td9: 수익 (B — 색상 span, 숫자만 삽입)
    const tdProfit = document.createElement('td');
    const profitSpan = document.createElement('span');
    if (isPending) {
      profitSpan.style.color = 'var(--text3)';
      profitSpan.style.fontSize = '11px';
      profitSpan.textContent = '대기중';
    } else {
      profitSpan.style.color = profitColor;
      profitSpan.textContent = (b.profit >= 0 ? '+' : '') + '₩' + Math.round(b.profit).toLocaleString();
    }
    tdProfit.appendChild(profitSpan);
    tr.appendChild(tdProfit);

    tbody.appendChild(tr);
  });
}


