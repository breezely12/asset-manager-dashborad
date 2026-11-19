const API = "/api";

const CATEGORY_LABEL = {
  stock: "주식", crypto: "가상자산", cash: "현금/예금", realestate: "부동산", other: "기타",
};
const CATEGORY_COLOR_VAR = {
  stock: "--series-1", crypto: "--series-2", cash: "--series-3", realestate: "--series-4", other: "--series-5",
};
const CATEGORY_ORDER = ["stock", "crypto", "cash", "realestate", "other"];

// household-ledger 대분류 -> 소분류, following the user's reference budget sheet
const LEDGER_CATEGORY_TAXONOMY = {
  "수입": ["남편월급", "남편상여", "아내월급", "아내상여", "부수입", "투자소득", "기타소득"],
  "저축·투자": ["예적금", "주식계좌", "대출원금상환", "펀드/ETF", "달러/금", "가상화폐"],
  "연금·노후": ["개인연금", "퇴직연금", "국민연금"],
  "비상금": ["비상금통장1", "비상금통장2"],
  "고정비": ["관리비", "도시가스", "대출이자"],
  "식비": ["식자재", "외식", "카페류"],
  "생활용품": ["생활소품", "가전/가구", "침구/인테리어", "수리/청소"],
  "꾸밈비": ["의류/잡화", "미용/헤어", "세탁/수선", "꾸밈/의류"],
  "건강": ["병원/약국", "건강보조", "예방/검진", "구독/멤버십"],
  "자기계발": ["스터디/수강", "운동", "도서"],
  "자동차": ["주유", "주차/통행료", "대중교통", "택시", "소모품/수리", "보험/세금"],
  "자녀": ["육아용품", "놀이/활동", "교육/도서", "기관/돌봄"],
  "반려동물": ["반려용품", "동물병원"],
  "여행": ["국내여행", "해외여행"],
  "문화생활": ["공연/전시", "OTT", "기타 입장료"],
  "경조사": ["가족/친척", "지인/동료"],
  "용돈": ["남편용돈", "아내용돈"],
  "보험": ["남편종합", "남편실비", "아내종합", "아내실비", "자녀종합"],
  "통신비": ["휴대폰", "인터넷/TV", "수리/Acc", "구독", "서비스"],
  "기타": ["세금", "회비", "기타"],
};

const fmtKRW = (n) => n == null ? "-" : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) + "원";
const fmtSigned = (n) => n == null ? "-" : (n >= 0 ? "+" : "") + new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) + "원";
const fmtPct = (n) => n == null ? "" : ` (${n >= 0 ? "+" : ""}${n.toFixed(1)}%)`;
const cssVar = (name) => getComputedStyle(document.querySelector(".viz-root")).getPropertyValue(name).trim();

async function api(path, options) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---------- donut chart ----------
function renderDonut(svgId, legendId, segments) {
  // segments: [{label, value, colorVar}]
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  svg.innerHTML = "";
  legend.innerHTML = "";

  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = 120, cy = 120, r = 80, strokeWidth = 32;
  const circumference = 2 * Math.PI * r;
  const gapDeg = total > 0 ? 2 : 0; // small surface gap between segments

  if (total <= 0) {
    const empty = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    empty.setAttribute("cx", cx); empty.setAttribute("cy", cy); empty.setAttribute("r", r);
    empty.setAttribute("fill", "none");
    empty.setAttribute("stroke", cssVar("--gridline"));
    empty.setAttribute("stroke-width", strokeWidth);
    svg.appendChild(empty);
    legend.innerHTML = `<li class="muted">데이터 없음</li>`;
    return;
  }

  let cumulativeDeg = -90;
  segments.filter((s) => s.value > 0).forEach((seg) => {
    const fraction = seg.value / total;
    const segDeg = fraction * 360;
    const drawDeg = Math.max(segDeg - gapDeg, 0.5);
    const dash = (drawDeg / 360) * circumference;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", cssVar(seg.colorVar));
    circle.setAttribute("stroke-width", strokeWidth);
    circle.setAttribute("stroke-linecap", "round");
    circle.setAttribute("stroke-dasharray", `${dash} ${circumference - dash}`);
    circle.setAttribute("transform", `rotate(${cumulativeDeg} ${cx} ${cy})`);
    circle.setAttribute("stroke-dashoffset", 0);
    svg.appendChild(circle);

    const li = document.createElement("li");
    li.innerHTML = `<span class="swatch" style="background:${cssVar(seg.colorVar)}"></span>` +
      `<span>${seg.label}</span><span class="legend-value">${(fraction * 100).toFixed(1)}%</span>`;
    legend.appendChild(li);

    cumulativeDeg += segDeg;
  });

  const centerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  centerText.setAttribute("x", cx); centerText.setAttribute("y", cy);
  centerText.setAttribute("text-anchor", "middle");
  centerText.setAttribute("dominant-baseline", "middle");
  centerText.setAttribute("font-size", "13");
  centerText.setAttribute("fill", cssVar("--text-secondary"));
  centerText.textContent = "총액";
  svg.appendChild(centerText);
}

// ---------- line chart (net worth history) ----------
function renderHistory(points, nextGoal) {
  const svg = document.getElementById("historyChart");
  const tooltip = document.getElementById("historyTooltip");
  svg.innerHTML = "";
  if (points.length === 0 && !nextGoal) {
    svg.innerHTML = `<text x="10" y="100" font-size="13" fill="${cssVar("--text-muted")}">스냅샷을 저장하면 변화 추이가 표시됩니다</text>`;
    return;
  }

  const W = 480, H = 220, padL = 50, padR = 10, padT = 28, padB = 25;
  const values = points.map((p) => p.total_krw);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, nextGoal ? nextGoal.target_krw : 0, 1);
  const x = (i) => padL + (i / Math.max(points.length - 1, 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - minV) / (maxV - minV || 1)) * (H - padT - padB);

  const ns = "http://www.w3.org/2000/svg";
  // gridlines
  for (let i = 0; i <= 3; i++) {
    const gy = padT + (i / 3) * (H - padT - padB);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
    line.setAttribute("y1", gy); line.setAttribute("y2", gy);
    line.setAttribute("stroke", cssVar("--gridline"));
    line.setAttribute("stroke-width", 1);
    svg.appendChild(line);
  }

  if (nextGoal) {
    const gy = y(nextGoal.target_krw);
    const goalLine = document.createElementNS(ns, "line");
    goalLine.setAttribute("x1", padL); goalLine.setAttribute("x2", W - padR);
    goalLine.setAttribute("y1", gy); goalLine.setAttribute("y2", gy);
    goalLine.setAttribute("stroke", cssVar("--series-2"));
    goalLine.setAttribute("stroke-width", 2);
    goalLine.setAttribute("stroke-dasharray", "5 4");
    svg.appendChild(goalLine);

    const goalLabel = document.createElementNS(ns, "text");
    goalLabel.setAttribute("x", W - padR);
    goalLabel.setAttribute("y", Math.min(gy + 16, H - padB - 4));
    goalLabel.setAttribute("text-anchor", "end");
    goalLabel.setAttribute("font-size", "11");
    goalLabel.setAttribute("fill", cssVar("--series-2"));
    const goalText = nextGoal.target_year
      ? `${nextGoal.target_year}년(${nextGoal.age}세) 목표 ${fmtKRW(nextGoal.target_krw)}`
      : `${nextGoal.age}세 목표 ${fmtKRW(nextGoal.target_krw)}`;
    goalLabel.textContent = goalText;
    svg.appendChild(goalLabel);
  }

  const path = document.createElementNS(ns, "path");
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.total_krw)}`).join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", cssVar("--series-1"));
  path.setAttribute("stroke-width", 2);
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  points.forEach((p, i) => {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.total_krw)); dot.setAttribute("r", 4);
    dot.setAttribute("fill", cssVar("--series-1"));
    dot.setAttribute("stroke", cssVar("--surface-1"));
    dot.setAttribute("stroke-width", 2);
    dot.addEventListener("mousemove", (e) => {
      tooltip.classList.remove("hidden");
      tooltip.style.left = `${(x(i) / W) * 100}%`;
      tooltip.style.top = `${(y(p.total_krw) / H) * 100}%`;
      tooltip.textContent = `${p.date}: ${fmtKRW(p.total_krw)}`;
    });
    dot.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
    svg.appendChild(dot);
  });
}

// ---------- bar chart (income vs expense) ----------
function renderBars(svgId, legendId, bars) {
  // bars: [{label, value, colorVar}]
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  svg.innerHTML = ""; legend.innerHTML = "";
  const W = 240, H = 220, padB = 20, padT = 10;
  const maxV = Math.max(...bars.map((b) => b.value), 1);
  const barW = 60, gap = 40;
  const startX = (W - (bars.length * barW + (bars.length - 1) * gap)) / 2;
  const ns = "http://www.w3.org/2000/svg";

  const baseline = document.createElementNS(ns, "line");
  baseline.setAttribute("x1", 0); baseline.setAttribute("x2", W);
  baseline.setAttribute("y1", H - padB); baseline.setAttribute("y2", H - padB);
  baseline.setAttribute("stroke", cssVar("--baseline"));
  svg.appendChild(baseline);

  bars.forEach((b, i) => {
    const h = (b.value / maxV) * (H - padT - padB);
    const bx = startX + i * (barW + gap);
    const by = H - padB - h;
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", bx); rect.setAttribute("y", by);
    rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(h, 1));
    rect.setAttribute("rx", 4);
    rect.setAttribute("fill", cssVar(b.colorVar));
    svg.appendChild(rect);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", bx + barW / 2); label.setAttribute("y", H - 4);
    label.setAttribute("text-anchor", "middle"); label.setAttribute("font-size", "11");
    label.setAttribute("fill", cssVar("--text-secondary"));
    label.textContent = b.label;
    svg.appendChild(label);

    const li = document.createElement("li");
    li.innerHTML = `<span class="swatch" style="background:${cssVar(b.colorVar)}"></span>` +
      `<span>${b.label}</span><span class="legend-value">${fmtKRW(b.value)}</span>`;
    legend.appendChild(li);
  });
}

// ---------- grouped monthly bar chart (income vs expense across 12 months) ----------
function renderMonthlyBars(svgId, legendId, months) {
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  svg.innerHTML = ""; legend.innerHTML = "";
  const W = 480, H = 240, padB = 24, padT = 10, padL = 4, padR = 4;
  const maxV = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
  const groupW = (W - padL - padR) / months.length;
  const barW = Math.min(groupW / 2 - 4, 14);
  const ns = "http://www.w3.org/2000/svg";

  const baseline = document.createElementNS(ns, "line");
  baseline.setAttribute("x1", padL); baseline.setAttribute("x2", W - padR);
  baseline.setAttribute("y1", H - padB); baseline.setAttribute("y2", H - padB);
  baseline.setAttribute("stroke", cssVar("--baseline"));
  svg.appendChild(baseline);

  months.forEach((m, i) => {
    const groupX = padL + i * groupW;
    const incH = (m.income / maxV) * (H - padT - padB);
    const expH = (m.expense / maxV) * (H - padT - padB);

    const incRect = document.createElementNS(ns, "rect");
    incRect.setAttribute("x", groupX + groupW / 2 - barW - 1);
    incRect.setAttribute("y", H - padB - incH);
    incRect.setAttribute("width", barW); incRect.setAttribute("height", Math.max(incH, 0.5));
    incRect.setAttribute("fill", cssVar("--series-1"));
    svg.appendChild(incRect);

    const expRect = document.createElementNS(ns, "rect");
    expRect.setAttribute("x", groupX + groupW / 2 + 1);
    expRect.setAttribute("y", H - padB - expH);
    expRect.setAttribute("width", barW); expRect.setAttribute("height", Math.max(expH, 0.5));
    expRect.setAttribute("fill", cssVar("--series-8"));
    svg.appendChild(expRect);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", groupX + groupW / 2); label.setAttribute("y", H - 8);
    label.setAttribute("text-anchor", "middle"); label.setAttribute("font-size", "10");
    label.setAttribute("fill", cssVar("--text-secondary"));
    label.textContent = m.month.slice(5);
    svg.appendChild(label);
  });

  legend.innerHTML =
    `<li><span class="swatch" style="background:${cssVar("--series-1")}"></span><span>수입</span></li>` +
    `<li><span class="swatch" style="background:${cssVar("--series-8")}"></span><span>지출</span></li>`;
}

// ---------- goals ----------
function renderGoalsList(goalsData) {
  const list = document.getElementById("goalsList");
  list.innerHTML = "";
  const currentYear = new Date().getFullYear();
  document.getElementById("goalsCurrentYear").textContent = `현재 ${currentYear}년`;
  goalsData.goals.forEach((g) => {
    const pct = Math.max(g.progress_pct ?? 0, 0);
    const fillPct = Math.min(pct, 100);
    const li = document.createElement("li");
    li.className = "goal-row";
    let yearsNote = "";
    if (g.target_year) {
      const diff = g.target_year - currentYear;
      yearsNote = g.achieved ? " · 달성" : diff > 0 ? ` · ${diff}년 후` : diff === 0 ? " · 올해" : ` · ${-diff}년 지남`;
    }
    const yearLabel = g.target_year ? `${g.target_year}년 · ${g.age}세${yearsNote}` : `${g.age}세`;
    li.innerHTML = `
      <div class="goal-label">${g.label || "목표"}<div class="goal-year">${yearLabel}</div></div>
      <div class="goal-track"><div class="goal-fill ${g.achieved ? "achieved" : ""}" style="width:${fillPct}%"></div></div>
      <div class="goal-pct ${g.achieved ? "achieved" : ""}">${pct.toFixed(1)}% · ${fmtKRW(g.target_krw)}</div>
    `;
    list.appendChild(li);
  });
}

function findNextGoal(goalsData) {
  const unmet = goalsData.goals.filter((g) => !g.achieved).sort((a, b) => a.target_krw - b.target_krw);
  return unmet[0] || goalsData.goals[goalsData.goals.length - 1] || null;
}

// ---------- overview ----------
async function loadOverview() {
  const [summary, snapshots, txSummary, goalsData] = await Promise.all([
    api("/summary"),
    api("/snapshots"),
    api("/transactions/summary?month=" + currentMonth()),
    api("/goals"),
  ]);

  document.getElementById("fxRate").textContent = `USD/KRW ${summary.fx_usdkrw.toFixed(0)}`;
  document.getElementById("totalValue").textContent = fmtKRW(summary.total_krw);
  document.getElementById("netWorthValue").textContent = fmtKRW(summary.net_worth_krw);
  document.getElementById("totalLiabilities").textContent = fmtKRW(summary.total_liabilities_krw);

  const gainEl = document.getElementById("totalGain");
  if (summary.total_gain_krw == null) {
    gainEl.textContent = "-"; gainEl.className = "stat-value";
  } else {
    gainEl.textContent = fmtSigned(summary.total_gain_krw) + fmtPct(summary.total_gain_pct);
    gainEl.className = "stat-value " + (summary.total_gain_krw >= 0 ? "good" : "critical");
  }

  document.getElementById("monthIncome").textContent = fmtKRW(txSummary.income);
  document.getElementById("monthExpense").textContent = fmtKRW(txSummary.expense);

  renderDonut(
    "allocationChart", "allocationLegend",
    CATEGORY_ORDER.map((c) => ({ label: CATEGORY_LABEL[c], value: summary.by_category[c] || 0, colorVar: CATEGORY_COLOR_VAR[c] }))
  );
  renderHistory(snapshots, findNextGoal(goalsData));
  renderGoalsList(goalsData);
}

// ---------- holdings ----------
async function loadHoldings() {
  const data = await api("/holdings");
  const tbody = document.querySelector("#holdingsTable tbody");
  tbody.innerHTML = "";
  data.holdings.forEach((h) => {
    const tr = document.createElement("tr");
    const gainClass = h.gain_krw == null ? "" : h.gain_krw >= 0 ? "gain-pos" : "gain-neg";
    tr.innerHTML = `
      <td>${CATEGORY_LABEL[h.category]}</td>
      <td>${h.name}${h.symbol ? ` <span class="muted">(${h.symbol})</span>` : ""}${h.price_ok === false ? ' <span class="muted">⚠️가격조회실패</span>' : ""}</td>
      <td>${h.quantity ?? "-"}</td>
      <td>${h.avg_cost != null ? h.avg_cost.toLocaleString() : "-"}</td>
      <td>${h.current_price != null ? h.current_price.toLocaleString() : "-"}</td>
      <td>${fmtKRW(h.value_krw)}</td>
      <td class="${gainClass}">${h.gain_krw != null ? fmtSigned(h.gain_krw) + fmtPct(h.gain_pct) : "-"}</td>
      <td><button class="btn btn-small edit-btn">수정</button> <button class="btn btn-small btn-danger del-btn">삭제</button></td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => openHoldingModal(h));
    tr.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm(`${h.name}을 삭제할까요?`)) { await api(`/holdings/${h.id}`, { method: "DELETE" }); loadHoldings(); loadOverview(); }
    });
    tbody.appendChild(tr);
  });
}

// ---------- liabilities ----------
async function loadLiabilities() {
  const liabilities = await api("/liabilities");
  const tbody = document.querySelector("#liabilitiesTable tbody");
  tbody.innerHTML = "";
  liabilities.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.name}</td>
      <td>${l.note ?? ""}</td>
      <td>${fmtKRW(l.balance_krw)}</td>
      <td><button class="btn btn-small edit-btn">수정</button> <button class="btn btn-small btn-danger del-btn">삭제</button></td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => openLiabilityModal(l));
    tr.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm(`${l.name}을 삭제할까요?`)) { await api(`/liabilities/${l.id}`, { method: "DELETE" }); loadLiabilities(); loadOverview(); }
    });
    tbody.appendChild(tr);
  });
}

const liabilityModal = document.getElementById("liabilityModal");
function openLiabilityModal(l) {
  document.getElementById("liabilityModalTitle").textContent = l ? "부채 수정" : "부채 추가";
  document.getElementById("l_id").value = l?.id ?? "";
  document.getElementById("l_name").value = l?.name ?? "";
  document.getElementById("l_balance").value = l?.balance_krw ?? "";
  document.getElementById("l_note").value = l?.note ?? "";
  liabilityModal.classList.remove("hidden");
}
document.getElementById("addLiabilityBtn").addEventListener("click", () => openLiabilityModal(null));
document.getElementById("liabilityCancelBtn").addEventListener("click", () => liabilityModal.classList.add("hidden"));
document.getElementById("liabilityForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("l_id").value;
  const body = {
    name: document.getElementById("l_name").value,
    balance_krw: parseFloat(document.getElementById("l_balance").value),
    note: document.getElementById("l_note").value || null,
  };
  if (id) await api(`/liabilities/${id}`, { method: "PUT", body: JSON.stringify(body) });
  else await api("/liabilities", { method: "POST", body: JSON.stringify(body) });
  liabilityModal.classList.add("hidden");
  loadLiabilities();
  loadOverview();
});

// ---------- holding modal ----------
const holdingModal = document.getElementById("holdingModal");
const holdingForm = document.getElementById("holdingForm");

function syncHoldingFormVisibility() {
  const cat = document.getElementById("h_category").value;
  const isLive = cat === "stock" || cat === "crypto";
  document.getElementById("h_symbolBlock").classList.toggle("hidden", !isLive);
  document.getElementById("h_qtyBlock").classList.toggle("hidden", !isLive);
  document.getElementById("h_manualBlock").classList.toggle("hidden", isLive);
}
document.getElementById("h_category").addEventListener("change", syncHoldingFormVisibility);

function openHoldingModal(h) {
  document.getElementById("holdingModalTitle").textContent = h ? "자산 수정" : "자산 추가";
  document.getElementById("h_id").value = h?.id ?? "";
  document.getElementById("h_category").value = h?.category ?? "stock";
  document.getElementById("h_name").value = h?.name ?? "";
  document.getElementById("h_symbol").value = h?.symbol ?? "";
  document.getElementById("h_quantity").value = h?.quantity ?? "";
  document.getElementById("h_avg_cost").value = h?.avg_cost ?? "";
  document.getElementById("h_manual_value").value = h?.category && !["stock","crypto"].includes(h.category) ? (h.manual_value ?? "") : "";
  document.getElementById("h_avg_cost_manual").value = h?.category && !["stock","crypto"].includes(h.category) ? (h.avg_cost ?? "") : "";
  document.getElementById("h_currency").value = h?.currency ?? "KRW";
  document.getElementById("h_note").value = h?.note ?? "";
  document.getElementById("h_lookupResult").textContent = "";
  document.getElementById("h_cryptoResults").innerHTML = "";
  syncHoldingFormVisibility();
  holdingModal.classList.remove("hidden");
}
document.getElementById("addHoldingBtn").addEventListener("click", () => openHoldingModal(null));
document.getElementById("holdingCancelBtn").addEventListener("click", () => holdingModal.classList.add("hidden"));

document.getElementById("h_lookupBtn").addEventListener("click", async () => {
  const cat = document.getElementById("h_category").value;
  const symbol = document.getElementById("h_symbol").value.trim();
  const resultEl = document.getElementById("h_lookupResult");
  const cryptoResultsEl = document.getElementById("h_cryptoResults");
  cryptoResultsEl.innerHTML = "";
  if (!symbol) { resultEl.textContent = "심볼 또는 이름을 입력하세요"; return; }

  if (cat === "stock") {
    resultEl.textContent = "조회 중...";
    const q = await api(`/lookup/stock/${encodeURIComponent(symbol)}`);
    resultEl.textContent = q.ok ? `${q.name}: ${q.price?.toLocaleString()} ${q.currency}` : `조회 실패: ${q.error ?? ""}`;
  } else if (cat === "crypto") {
    resultEl.textContent = "검색 중...";
    const results = await api(`/lookup/crypto/search?q=${encodeURIComponent(symbol)}`);
    resultEl.textContent = results.length ? "아래에서 선택하세요" : "검색 결과 없음";
    results.forEach((r) => {
      const div = document.createElement("div");
      div.className = "crypto-option";
      div.textContent = `${r.name} (${r.symbol})`;
      div.addEventListener("click", () => {
        document.getElementById("h_symbol").value = r.id;
        resultEl.textContent = `선택됨: ${r.name} (${r.symbol}) — id=${r.id}`;
        cryptoResultsEl.innerHTML = "";
      });
      cryptoResultsEl.appendChild(div);
    });
  }
});

holdingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("h_id").value;
  const category = document.getElementById("h_category").value;
  const isLive = category === "stock" || category === "crypto";
  const body = {
    category,
    name: document.getElementById("h_name").value,
    currency: document.getElementById("h_currency").value,
    note: document.getElementById("h_note").value || null,
    symbol: isLive ? (document.getElementById("h_symbol").value || null) : null,
    quantity: isLive ? parseFloat(document.getElementById("h_quantity").value) || null : null,
    avg_cost: isLive
      ? (parseFloat(document.getElementById("h_avg_cost").value) || null)
      : (parseFloat(document.getElementById("h_avg_cost_manual").value) || null),
    manual_value: isLive ? null : (parseFloat(document.getElementById("h_manual_value").value) || null),
  };
  if (id) await api(`/holdings/${id}`, { method: "PUT", body: JSON.stringify(body) });
  else await api("/holdings", { method: "POST", body: JSON.stringify(body) });
  holdingModal.classList.add("hidden");
  loadHoldings();
  loadOverview();
});

// ---------- ledger ----------
function currentMonth() {
  const el = document.getElementById("ledgerMonth");
  return el.value || new Date().toISOString().slice(0, 7);
}

async function loadLedger() {
  const month = currentMonth();
  const [txs, txSummary] = await Promise.all([
    api(`/transactions?month=${month}`),
    api(`/transactions/summary?month=${month}`),
  ]);

  renderBars("ledgerBarChart", "ledgerBarLegend", [
    { label: "수입", value: txSummary.income, colorVar: "--series-1" },
    { label: "지출", value: txSummary.expense, colorVar: "--series-8" },
  ]);

  const categories = Object.entries(txSummary.by_category).sort((a, b) => b[1] - a[1]);
  const colorVars = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5"];
  renderDonut("expenseChart", "expenseLegend",
    categories.map(([label, value], i) => ({ label, value, colorVar: colorVars[i % colorVars.length] }))
  );

  const tbody = document.querySelector("#txTable tbody");
  tbody.innerHTML = "";
  txs.forEach((t) => {
    const tr = document.createElement("tr");
    if (!t.count_in_total) tr.className = "muted";
    const excludedTag = t.count_in_total ? "" : ' <span class="muted">(합계 제외)</span>';
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.type === "income" ? "수입" : "지출"}</td>
      <td>${t.category}${excludedTag}</td>
      <td>${t.payment_method ?? ""}</td>
      <td>${fmtKRW(t.amount)}</td>
      <td>${t.memo ?? ""}</td>
      <td><button class="btn btn-small edit-btn">수정</button> <button class="btn btn-small btn-danger del-btn">삭제</button></td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => openTxModal(t));
    tr.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm("삭제할까요?")) { await api(`/transactions/${t.id}`, { method: "DELETE" }); loadLedger(); loadOverview(); }
    });
    tbody.appendChild(tr);
  });
}

document.getElementById("ledgerMonth").addEventListener("change", loadLedger);

const txModal = document.getElementById("txModal");
const majorSelect = document.getElementById("t_category_major");
const minorSelect = document.getElementById("t_category_minor");

majorSelect.innerHTML = Object.keys(LEDGER_CATEGORY_TAXONOMY)
  .map((major) => `<option value="${major}">${major}</option>`).join("");

function populateMinorOptions(major, selectedMinor) {
  const minors = LEDGER_CATEGORY_TAXONOMY[major] || [];
  minorSelect.innerHTML = minors.map((m) => `<option value="${m}">${m}</option>`).join("");
  if (selectedMinor && minors.includes(selectedMinor)) minorSelect.value = selectedMinor;
}
majorSelect.addEventListener("change", () => populateMinorOptions(majorSelect.value));

function openTxModal(t, kind) {
  document.getElementById("txModalTitle").textContent = t ? "내역 수정" : "내역 추가";
  document.getElementById("t_id").value = t?.id ?? "";
  document.getElementById("t_kind").value = t?.kind ?? kind ?? "ledger";
  document.getElementById("t_date").value = t?.date ?? new Date().toISOString().slice(0, 10);
  document.getElementById("t_type").value = t?.type ?? "expense";

  let major = Object.keys(LEDGER_CATEGORY_TAXONOMY)[0];
  let minor = null;
  if (t?.category && t.category.includes("-")) {
    const idx = t.category.indexOf("-");
    const candidateMajor = t.category.slice(0, idx);
    if (LEDGER_CATEGORY_TAXONOMY[candidateMajor]) {
      major = candidateMajor;
      minor = t.category.slice(idx + 1);
    }
  } else if (t?.category && LEDGER_CATEGORY_TAXONOMY[t.category]) {
    major = t.category;
  }
  majorSelect.value = major;
  populateMinorOptions(major, minor);
  if (t?.category && !minor && !LEDGER_CATEGORY_TAXONOMY[t.category]) {
    // legacy free-text category that doesn't match the taxonomy: keep it visible via memo note
    document.getElementById("t_memo").value = t?.memo ? t.memo : "";
  }

  document.getElementById("t_payment_method").value = t?.payment_method ?? "";
  document.getElementById("t_amount").value = t?.amount ?? "";
  document.getElementById("t_memo").value = t?.memo ?? "";
  document.getElementById("t_count_in_total").checked = t ? !!t.count_in_total : true;
  txModal.classList.remove("hidden");
}
document.getElementById("addTxBtn").addEventListener("click", () => openTxModal(null, "ledger"));
document.getElementById("addInvestmentBtn").addEventListener("click", () => openTxModal(null, "investment"));
document.getElementById("txCancelBtn").addEventListener("click", () => txModal.classList.add("hidden"));
document.getElementById("txForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("t_id").value;
  const kind = document.getElementById("t_kind").value;
  const category = `${majorSelect.value}-${minorSelect.value}`;
  const body = {
    date: document.getElementById("t_date").value,
    type: document.getElementById("t_type").value,
    category,
    amount: parseFloat(document.getElementById("t_amount").value),
    memo: document.getElementById("t_memo").value || null,
    payment_method: document.getElementById("t_payment_method").value || null,
    count_in_total: document.getElementById("t_count_in_total").checked,
    kind,
  };
  if (id) await api(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(body) });
  else await api("/transactions", { method: "POST", body: JSON.stringify(body) });
  txModal.classList.add("hidden");
  if (kind === "investment") loadInvestments();
  else loadLedger();
  loadOverview();
});

// ---------- investments ----------
async function loadInvestments() {
  const [items, summary] = await Promise.all([
    api("/investments"),
    api("/investments/summary"),
  ]);

  document.getElementById("investmentIncome").textContent = fmtKRW(summary.income);
  document.getElementById("investmentExpense").textContent = fmtKRW(summary.expense);
  const netEl = document.getElementById("investmentNet");
  netEl.textContent = fmtSigned(summary.net);
  netEl.className = "stat-value " + (summary.net >= 0 ? "good" : "critical");

  const tbody = document.querySelector("#investmentTable tbody");
  tbody.innerHTML = "";
  items.forEach((t) => {
    const tr = document.createElement("tr");
    if (!t.count_in_total) tr.className = "muted";
    const excludedTag = t.count_in_total ? "" : ' <span class="muted">(합계 제외)</span>';
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.type === "income" ? "입금" : "출금"}</td>
      <td>${t.category}${excludedTag}</td>
      <td>${fmtKRW(t.amount)}</td>
      <td>${t.memo ?? ""}</td>
      <td><button class="btn btn-small edit-btn">수정</button> <button class="btn btn-small btn-danger del-btn">삭제</button></td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => openTxModal(t, "investment"));
    tr.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm("삭제할까요?")) { await api(`/transactions/${t.id}`, { method: "DELETE" }); loadInvestments(); }
    });
    tbody.appendChild(tr);
  });
}
document.querySelector('.tab-btn[data-tab="investment"]').addEventListener("click", loadInvestments);

// ---------- yearly report ----------
async function loadYearlyYears() {
  const years = await api("/transactions/years");
  const select = document.getElementById("yearlySelect");
  const currentYear = String(new Date().getFullYear());
  const options = years.includes(currentYear) ? years : [currentYear, ...years];
  select.innerHTML = options.map((y) => `<option value="${y}">${y}년</option>`).join("");
  select.value = currentYear;
}

async function loadYearly() {
  const year = document.getElementById("yearlySelect").value;
  const data = await api(`/transactions/yearly?year=${year}`);

  document.getElementById("yearlyIncome").textContent = fmtKRW(data.total_income);
  document.getElementById("yearlyExpense").textContent = fmtKRW(data.total_expense);
  const netEl = document.getElementById("yearlyNet");
  netEl.textContent = fmtSigned(data.net);
  netEl.className = "stat-value " + (data.net >= 0 ? "good" : "critical");

  renderMonthlyBars("yearlyMonthlyChart", "yearlyMonthlyLegend", data.months);

  const splitCategory = (full) => {
    const idx = full.indexOf("-");
    return idx === -1 ? [full, ""] : [full.slice(0, idx), full.slice(idx + 1)];
  };

  const majorTotals = {};
  const subRows = [];
  Object.entries(data.by_category).forEach(([full, value]) => {
    const [major, minor] = splitCategory(full);
    majorTotals[major] = (majorTotals[major] || 0) + value;
    subRows.push({ major, minor, value });
  });

  const colorVars = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-8"];
  const majorCategories = Object.entries(majorTotals).sort((a, b) => b[1] - a[1]);
  renderDonut("yearlyCategoryChart", "yearlyCategoryLegend",
    majorCategories.map(([label, value], i) => ({ label, value, colorVar: colorVars[i % colorVars.length] }))
  );

  const totalExpense = subRows.reduce((s, r) => s + r.value, 0);
  const tbody = document.querySelector("#yearlyCategoryTable tbody");
  tbody.innerHTML = "";
  subRows.sort((a, b) => b.value - a.value).forEach((r) => {
    const tr = document.createElement("tr");
    const pct = totalExpense > 0 ? (r.value / totalExpense * 100).toFixed(1) : "0.0";
    tr.innerHTML = `
      <td>${r.major}</td>
      <td>${r.minor || "-"}</td>
      <td>${fmtKRW(r.value)}</td>
      <td>${pct}%</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById("yearlySelect").addEventListener("change", loadYearly);
document.querySelector('.tab-btn[data-tab="yearly"]').addEventListener("click", loadYearly);

// ---------- snapshot ----------
document.getElementById("snapshotBtn").addEventListener("click", async () => {
  await api("/snapshot", { method: "POST" });
  loadOverview();
});

// ---------- init ----------
document.getElementById("ledgerMonth").value = new Date().toISOString().slice(0, 7);
loadOverview();
loadHoldings();
loadLiabilities();
loadLedger();
loadYearlyYears().then(loadYearly);
loadInvestments();
