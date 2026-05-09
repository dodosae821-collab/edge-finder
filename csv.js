// ============================================================
// data/csv.js
// 담당: CSV/JSON 내보내기 / 가져오기
//
// 의존 (전역 — 허용):
//   getBets(), saveBets() (state.js)
//   bets (전역 배열)
//   actualFolderCount (ui/bet_list.js 예정)
//   updateAll (전역)
// ============================================================

function exportCSV() {
  if (bets.length === 0) { showToast('내보낼 베팅 기록이 없습니다.', 'info'); return; }
  const headers = ['날짜','경기','종목','형식','방식','배당','베팅금','결과','손익','메모'];
  const rows = bets.map(b => [
    b.date || '',
    (b.game || '').replace(/,/g, ';'),
    (b.sport || '').replace(/,/g, ';'),
    (b.type || '').replace(/,/g, ';'),
    b.mode === 'multi' ? `다폴${actualFolderCount(b)}` : '단폴',
    b.betmanOdds || '',
    b.amount || '',
    b.result || '',
    Math.round(b.profit) || 0,
    (b.memo || '').replace(/,/g, ';'),
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edge_finder_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}



function handleCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const lines = ev.target.result.split('\n').slice(1);
    const parsedBets = lines
      .filter(line => line.split(',')[1])
      .map(line => {
        const [date,game,sport,type,bOdds,pOdds,amount,result] = line.split(',');
        const bet = {
          id: Date.now() + Math.random(),
          date: date?.trim(), game: game?.trim(), sport: sport?.trim() || 'NBA',
          type: type?.trim() || 'UNDER', isValue: false,
          betmanOdds: parseFloat(bOdds) || 1.85,
          gap: 0, amount: parseFloat(amount) || 0,
          result: result?.trim()?.toUpperCase() || 'PENDING', memo: ''
        };
        bet.profit = bet.result === 'WIN' ? bet.amount * (bet.betmanOdds - 1) :
                     bet.result === 'LOSE' ? -bet.amount : 0;
        return bet;
      });

    const migrated = migrateBets(parsedBets);
    const newBets = migrated.filter(validateBet);

    const total = parsedBets.length;
    const valid = newBets.length;
    const invalid = total - valid;

    if (newBets.length === 0) {
      showToast(`유효한 베팅 데이터가 없습니다. (전체 ${total}건 검증 실패)`, 'error');
      return;
    }

    saveBets([...getBets(), ...newBets], { refresh: false });
    updateAll();
    showToast(`${total}건 중 ${valid}건 로드 완료${invalid > 0 ? ` (${invalid}건 제외)` : ''}`, 'success');
  };
  reader.readAsText(file);
}

// ========== RENDER TABLE ==========

