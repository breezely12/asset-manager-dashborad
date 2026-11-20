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
  "수입": ["본인월급", "본인상여", "부수입", "투자소득", "기타소득", "양육비"],
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
  "용돈": ["본인용돈"],
  "보험": ["본인종합", "본인실비", "자녀종합"],
  "통신비": ["휴대폰", "인터넷/TV", "수리/Acc", "구독", "서비스"],
  "기타": ["세금", "회비", "기타"],
  "나뭇가지": ["십일조", "감사", "기타"],
};

function splitCategory(full) {
  const idx = (full || "").indexOf("-");
  return idx === -1 ? [full || "", ""] : [full.slice(0, idx), full.slice(idx + 1)];
}

const fmtKRW = (n) => n == null ? "-" : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) + "원";
const fmtSigned = (n) => n == null ? "-" : (n >= 0 ? "+" : "") + new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) + "원";
const fmtMillions = (n) => n == null ? "-" : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n / 1e6) + "백만원";
const fmtSignedMillions = (n) => n == null ? "-" : (n >= 0 ? "+" : "") + new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n / 1e6) + "백만원";
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
function renderDonut(svgId, legendId, segments, options = {}) {
  const minPct = options.minPct || 0;
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

  const visibleSegments = segments.filter((s) => s.value > 0);
  const tonalColor = (i, n) => {
    if (n <= 1) return `color-mix(in srgb, var(${options.tonalBase}) 70%, white)`;
    const pct = 92 - (i / (n - 1)) * 68; // darkest/most saturated first, fading lighter
    return `color-mix(in srgb, var(${options.tonalBase}) ${pct.toFixed(0)}%, white)`;
  };

  let cumulativeDeg = -90;
  visibleSegments.forEach((seg, i) => {
    const fraction = seg.value / total;
    const segDeg = fraction * 360;
    const drawDeg = Math.max(segDeg - gapDeg, 0.5);
    const dash = (drawDeg / 360) * circumference;
    const color = options.tonalBase ? tonalColor(i, visibleSegments.length) : cssVar(seg.colorVar);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", strokeWidth);
    circle.setAttribute("stroke-linecap", "round");
    circle.setAttribute("stroke-dasharray", `${dash} ${circumference - dash}`);
    circle.setAttribute("transform", `rotate(${cumulativeDeg} ${cx} ${cy})`);
    circle.setAttribute("stroke-dashoffset", 0);
    svg.appendChild(circle);

    if (fraction * 100 >= minPct) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="swatch" style="background:${color}"></span>` +
        `<span>${seg.label}</span><span class="legend-value">${(fraction * 100).toFixed(1)}%</span>`;
      legend.appendChild(li);
    }

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
function renderSignedHBarList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (items.length === 0) {
    container.innerHTML = `<div class="muted">데이터 없음</div>`;
    return;
  }
  const maxV = Math.max(...items.map(([, v]) => Math.abs(v)), 1);
  items.forEach(([label, value]) => {
    const pctOfMax = (Math.abs(value) / maxV * 100).toFixed(1);
    const fillColor = value >= 0 ? cssVar("--good") : cssVar("--critical");
    const row = document.createElement("div");
    row.className = "yearly-hbar-row";
    row.innerHTML = `
      <div class="yearly-hbar-label">${label}</div>
      <div class="yearly-hbar-track"><div class="yearly-hbar-fill" style="width:${pctOfMax}%;background:${fillColor}"></div></div>
      <div class="yearly-hbar-value">${fmtSignedMillions(value)}</div>
    `;
    container.appendChild(row);
  });
}

async function loadHoldings() {
  const data = await api("/holdings");

  try {
    const valueTotals = {};
    let gainTotal = 0;
    const gainTotals = {};
    data.holdings.forEach((h) => {
      const label = CATEGORY_LABEL[h.category] || h.category;
      valueTotals[label] = (valueTotals[label] || 0) + (h.value_krw || 0);
      if (h.gain_krw != null) {
        gainTotals[label] = (gainTotals[label] || 0) + h.gain_krw;
        gainTotal += h.gain_krw;
      }
    });
    const totalValue = data.holdings.reduce((s, h) => s + (h.value_krw || 0), 0);
    const pillEl = document.getElementById("holdingsValuePill");
    if (pillEl) pillEl.textContent = `총 평가금액 ${fmtMillions(totalValue)}`;
    const countEl = document.getElementById("holdingsCountLabel");
    if (countEl) countEl.textContent = `보유 자산 ${data.holdings.length}건`;
    renderHBarList("holdingsValueBars", Object.entries(valueTotals).sort((a, b) => b[1] - a[1]), totalValue);

    const gainPillEl = document.getElementById("holdingsGainPill");
    if (gainPillEl) gainPillEl.textContent = `총 손익 ${fmtSignedMillions(gainTotal)}`;
    renderSignedHBarList("holdingsGainBars", Object.entries(gainTotals).sort((a, b) => b[1] - a[1]));
  } catch (e) {
    console.error("holdings category chart render failed", e);
  }

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
      <td>${fmtMillions(h.value_krw)}</td>
      <td class="${gainClass}">${h.gain_krw != null ? fmtSignedMillions(h.gain_krw) + fmtPct(h.gain_pct) : "-"}</td>
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
  renderDonut("expenseChart", "expenseLegend",
    categories.map(([label, value]) => ({ label, value })),
    { minPct: 2, tonalBase: "--series-8" }
  );

  const fillCategoryBox = (tbodyId, byCategory, base) => {
    const tbody = document.querySelector(`#${tbodyId} tbody`);
    tbody.innerHTML = "";
    const rows = Object.entries(byCategory).map(([full, value]) => {
      const [major, minor] = splitCategory(full);
      return { major, minor, value };
    });
    rows.sort((a, b) => b.value - a.value).forEach((r) => {
      const pct = base > 0 ? (r.value / base * 100).toFixed(1) : "0.0";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.major}</td>
        <td>${r.minor || "-"}</td>
        <td>${fmtKRW(r.value)}</td>
        <td>${pct}%</td>
      `;
      tbody.appendChild(tr);
    });
  };
  fillCategoryBox("txCategoryIncomeTable", txSummary.by_category_income, txSummary.income);
  fillExpenseCategoryBox("txCategoryExpenseTable", txSummary.by_category, txSummary.expense);

  currentLedgerTxs = txs;
  populateTxFilterOptions(txs);
  renderTxTable();
}

function fillExpenseCategoryBox(tbodyId, byCategory, base) {
  const tbody = document.querySelector(`#${tbodyId} tbody`);
  tbody.innerHTML = "";

  const majors = {};
  Object.entries(byCategory).forEach(([full, value]) => {
    const [major, minor] = splitCategory(full);
    if (!majors[major]) majors[major] = { total: 0, minors: [] };
    majors[major].total += value;
    majors[major].minors.push({ minor, value });
  });

  Object.entries(majors)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([major, group], i) => {
      const pct = base > 0 ? (group.total / base * 100).toFixed(1) : "0.0";
      const groupId = `exp-cat-group-${i}`;
      const majorRow = document.createElement("tr");
      majorRow.className = "category-major-row";
      majorRow.innerHTML = `
        <td><span class="category-toggle">▸</span> ${major}</td>
        <td>-</td>
        <td>${fmtKRW(group.total)}</td>
        <td>${pct}%</td>
      `;
      majorRow.addEventListener("click", () => {
        const expanded = majorRow.classList.toggle("expanded");
        majorRow.querySelector(".category-toggle").textContent = expanded ? "▾" : "▸";
        tbody.querySelectorAll(`tr[data-group="${groupId}"]`).forEach((tr) => {
          tr.classList.toggle("hidden", !expanded);
        });
      });
      tbody.appendChild(majorRow);

      group.minors.sort((a, b) => b.value - a.value).forEach((m) => {
        const minorPct = base > 0 ? (m.value / base * 100).toFixed(1) : "0.0";
        const minorRow = document.createElement("tr");
        minorRow.className = "category-minor-row hidden";
        minorRow.dataset.group = groupId;
        minorRow.innerHTML = `
          <td></td>
          <td>${m.minor || "-"}</td>
          <td>${fmtKRW(m.value)}</td>
          <td>${minorPct}%</td>
        `;
        tbody.appendChild(minorRow);
      });
    });
}

let currentLedgerTxs = [];
const txFilters = { type: "", major: "", minor: "", payment_method: "" };
const txSort = { col: "date", dir: "desc" };

function populateTxFilterOptions(txs) {
  const majorSelect = document.getElementById("txFilterMajor");
  const paymentSelect = document.getElementById("txFilterPayment");

  const majors = Object.keys(LEDGER_CATEGORY_TAXONOMY);
  majorSelect.innerHTML = `<option value="">대분류: 전체</option>` +
    majors.map((m) => `<option value="${m}" ${txFilters.major === m ? "selected" : ""}>${m}</option>`).join("");

  updateMinorFilterOptions();

  const payments = Array.from(new Set(txs.map((t) => t.payment_method).filter(Boolean))).sort();
  paymentSelect.innerHTML = `<option value="">결제수단: 전체</option>` +
    payments.map((p) => `<option value="${p}" ${txFilters.payment_method === p ? "selected" : ""}>${p}</option>`).join("");
  if (!payments.includes(txFilters.payment_method)) txFilters.payment_method = "";

  document.getElementById("txFilterType").value = txFilters.type;
}

function updateMinorFilterOptions() {
  const minorSelect = document.getElementById("txFilterMinor");
  const minors = txFilters.major ? (LEDGER_CATEGORY_TAXONOMY[txFilters.major] || []) : [];
  minorSelect.innerHTML = `<option value="">소분류: 전체</option>` +
    minors.map((m) => `<option value="${m}" ${txFilters.minor === m ? "selected" : ""}>${m}</option>`).join("");
  if (!minors.includes(txFilters.minor)) txFilters.minor = "";
}

function renderTxTable() {
  const tbody = document.querySelector("#txTable tbody");
  tbody.innerHTML = "";

  let rows = currentLedgerTxs.filter((t) => {
    const [major, minor] = splitCategory(t.category);
    if (txFilters.type && t.type !== txFilters.type) return false;
    if (txFilters.major && major !== txFilters.major) return false;
    if (txFilters.minor && minor !== txFilters.minor) return false;
    if (txFilters.payment_method && t.payment_method !== txFilters.payment_method) return false;
    return true;
  });

  const dir = txSort.dir === "asc" ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    let av, bv;
    if (txSort.col === "major" || txSort.col === "minor") {
      const [aMajor, aMinor] = splitCategory(a.category);
      const [bMajor, bMinor] = splitCategory(b.category);
      av = txSort.col === "major" ? aMajor : aMinor;
      bv = txSort.col === "major" ? bMajor : bMinor;
    } else {
      av = a[txSort.col];
      bv = b[txSort.col];
    }
    av = av ?? "";
    bv = bv ?? "";
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv), "ko") * dir;
  });

  document.querySelectorAll('#txTable th.sortable .sort-arrow').forEach((el) => (el.textContent = ""));
  const activeHeader = document.querySelector(`#txTable th.sortable[data-sort="${txSort.col}"] .sort-arrow`);
  if (activeHeader) activeHeader.textContent = txSort.dir === "asc" ? "▲" : "▼";

  rows.forEach((t) => {
    const tr = document.createElement("tr");
    if (!t.count_in_total) tr.className = "muted";
    const excludedTag = t.count_in_total ? "" : ' <span class="muted">(합계 제외)</span>';
    const [major, minor] = splitCategory(t.category);
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.type === "income" ? "수입" : "지출"}</td>
      <td class="category-major-cell">${major}</td>
      <td class="category-minor-cell">${minor}${excludedTag}</td>
      <td>${t.payment_method ?? ""}</td>
      <td>${fmtKRW(t.amount)}</td>
      <td>${t.memo ?? ""}</td>
      <td>
        <button class="btn btn-small edit-btn">수정</button>
        <button class="btn btn-small move-btn">투자로</button>
        <button class="btn btn-small btn-danger del-btn">삭제</button>
      </td>
    `;
    const majorCell = tr.querySelector(".category-major-cell");
    const minorCell = tr.querySelector(".category-minor-cell");
    majorCell.addEventListener("click", () => openMajorPicker(majorCell, minorCell, t, loadLedger));
    minorCell.addEventListener("click", () => openMinorPicker(minorCell, t, loadLedger));
    tr.querySelector(".edit-btn").addEventListener("click", () => openTxModal(t));
    tr.querySelector(".move-btn").addEventListener("click", () => moveTransactionKind(t, "investment"));
    tr.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm("삭제할까요?")) { await api(`/transactions/${t.id}`, { method: "DELETE" }); loadLedger(); loadOverview(); }
    });
    tbody.appendChild(tr);
  });
}

document.getElementById("txFilterType").addEventListener("change", (e) => {
  txFilters.type = e.target.value;
  renderTxTable();
});
document.getElementById("txFilterMajor").addEventListener("change", (e) => {
  txFilters.major = e.target.value;
  txFilters.minor = "";
  updateMinorFilterOptions();
  renderTxTable();
});
document.getElementById("txFilterMinor").addEventListener("change", (e) => {
  txFilters.minor = e.target.value;
  renderTxTable();
});
document.getElementById("txFilterPayment").addEventListener("change", (e) => {
  txFilters.payment_method = e.target.value;
  renderTxTable();
});
document.getElementById("txFilterReset").addEventListener("click", () => {
  txFilters.type = "";
  txFilters.major = "";
  txFilters.minor = "";
  txFilters.payment_method = "";
  populateTxFilterOptions(currentLedgerTxs);
  renderTxTable();
});
document.querySelectorAll('#txTable th.sortable').forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (txSort.col === col) {
      txSort.dir = txSort.dir === "asc" ? "desc" : "asc";
    } else {
      txSort.col = col;
      txSort.dir = col === "date" || col === "amount" ? "desc" : "asc";
    }
    renderTxTable();
  });
});

async function moveTransactionKind(t, newKind) {
  await api(`/transactions/${t.id}`, { method: "PUT", body: JSON.stringify({ ...t, kind: newKind }) });
  await Promise.all([loadLedger(), loadInvestments(), loadOverview()]);
}

// ---------- inline category pickers (대분류/소분류 as separate columns) ----------
function closeCategoryPopover(cell) {
  const popover = cell.querySelector(".category-picker-float");
  if (popover) popover.remove();
  cell.classList.remove("is-editing");
}

function attachOutsideClose(cell, popover) {
  const handler = (e) => {
    if (!popover.contains(e.target)) {
      closeCategoryPopover(cell);
      document.removeEventListener("click", handler, true);
    }
  };
  setTimeout(() => document.addEventListener("click", handler, true), 0);
}

function openMajorPicker(majorCell, minorCell, t, onSaved) {
  if (majorCell.querySelector(".category-picker-float")) return;
  const [currentMajor, currentMinor] = splitCategory(t.category);
  const options = Object.keys(LEDGER_CATEGORY_TAXONOMY)
    .map((major) => `<option value="${major}" ${major === currentMajor ? "selected" : ""}>${major}</option>`)
    .join("");
  const popover = document.createElement("div");
  popover.className = "category-picker-float";
  popover.innerHTML = `
    <select class="category-major-select">${options}</select>
    <button type="button" class="category-picker-close">✕</button>
  `;
  majorCell.classList.add("is-editing");
  majorCell.appendChild(popover);
  popover.addEventListener("click", (e) => e.stopPropagation());
  popover.querySelector("select").addEventListener("change", async (e) => {
    const newMajor = e.target.value;
    const minors = LEDGER_CATEGORY_TAXONOMY[newMajor] || [];
    const newMinor = minors.includes(currentMinor) ? currentMinor : (minors[0] || "");
    await api(`/transactions/${t.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...t, category: `${newMajor}-${newMinor}` }),
    });
    onSaved();
  });
  popover.querySelector(".category-picker-close").addEventListener("click", () => closeCategoryPopover(majorCell));
  attachOutsideClose(majorCell, popover);
}

function openMinorPicker(minorCell, t, onSaved) {
  if (minorCell.querySelector(".category-picker-float")) return;
  const [currentMajor, currentMinor] = splitCategory(t.category);
  const minors = LEDGER_CATEGORY_TAXONOMY[currentMajor] || [];
  const options = minors.map((m) => `<option value="${m}" ${m === currentMinor ? "selected" : ""}>${m}</option>`).join("");
  const popover = document.createElement("div");
  popover.className = "category-picker-float";
  popover.innerHTML = `
    <select class="category-minor-select">${options}</select>
    <button type="button" class="category-picker-close">✕</button>
  `;
  minorCell.classList.add("is-editing");
  minorCell.appendChild(popover);
  popover.addEventListener("click", (e) => e.stopPropagation());
  popover.querySelector("select").addEventListener("change", async (e) => {
    await api(`/transactions/${t.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...t, category: `${currentMajor}-${e.target.value}` }),
    });
    onSaved();
  });
  popover.querySelector(".category-picker-close").addEventListener("click", () => closeCategoryPopover(minorCell));
  attachOutsideClose(minorCell, popover);
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

  const catTbody = document.querySelector("#investmentCategoryTable tbody");
  catTbody.innerHTML = "";
  Object.entries(summary.by_category)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .forEach(([category, value]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${category}</td>
        <td class="${value >= 0 ? "gain-pos" : "gain-neg"}">${fmtSigned(value)}</td>
      `;
      catTbody.appendChild(tr);
    });

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
      <td>
        <button class="btn btn-small edit-btn">수정</button>
        <button class="btn btn-small move-btn">가계부로</button>
        <button class="btn btn-small btn-danger del-btn">삭제</button>
      </td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => openTxModal(t, "investment"));
    tr.querySelector(".move-btn").addEventListener("click", () => moveTransactionKind(t, "ledger"));
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

let yearlyData = null;

function majorTotalsOf(byCategory) {
  const totals = {};
  Object.entries(byCategory).forEach(([full, value]) => {
    const [major] = splitCategory(full);
    totals[major] = (totals[major] || 0) + value;
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function renderHBarList(containerId, majorTotalsList, base, limit) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const list = limit ? majorTotalsList.slice(0, limit) : majorTotalsList;
  const maxV = Math.max(...list.map(([, v]) => v), 1);
  list.forEach(([label, value]) => {
    const pctOfMax = (value / maxV * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "yearly-hbar-row";
    row.innerHTML = `
      <div class="yearly-hbar-label">${label}</div>
      <div class="yearly-hbar-track"><div class="yearly-hbar-fill" style="width:${pctOfMax}%"></div></div>
      <div class="yearly-hbar-value">${fmtKRW(value)}</div>
    `;
    container.appendChild(row);
  });
}

function renderSavingsDonut(income, expense) {
  const svg = document.getElementById("yearlySavingsDonut");
  svg.innerHTML = "";
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income * 100) : 0;
  const cx = 80, cy = 80, r = 58, strokeWidth = 20;
  const circumference = 2 * Math.PI * r;
  const ns = "http://www.w3.org/2000/svg";

  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", cx); track.setAttribute("cy", cy); track.setAttribute("r", r);
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", cssVar("--gridline"));
  track.setAttribute("stroke-width", strokeWidth);
  svg.appendChild(track);

  const frac = Math.max(0, Math.min(1, savingsRate / 100));
  if (frac > 0) {
    const dash = frac * circumference;
    const arc = document.createElementNS(ns, "circle");
    arc.setAttribute("cx", cx); arc.setAttribute("cy", cy); arc.setAttribute("r", r);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", cssVar("--accent"));
    arc.setAttribute("stroke-width", strokeWidth);
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("stroke-dasharray", `${dash} ${circumference - dash}`);
    arc.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
    svg.appendChild(arc);
  }

  const label = document.createElementNS(ns, "text");
  label.setAttribute("x", cx); label.setAttribute("y", cy - 6);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "11");
  label.setAttribute("fill", cssVar("--text-muted"));
  label.textContent = "저축률";
  svg.appendChild(label);

  const value = document.createElementNS(ns, "text");
  value.setAttribute("x", cx); value.setAttribute("y", cy + 16);
  value.setAttribute("text-anchor", "middle");
  value.setAttribute("font-size", "22");
  value.setAttribute("font-weight", "700");
  value.setAttribute("fill", savingsRate >= 0 ? cssVar("--text-primary") : cssVar("--critical"));
  value.textContent = `${savingsRate.toFixed(0)}%`;
  svg.appendChild(value);
}

function renderYearlyTrend(months) {
  const svg = document.getElementById("yearlyTrendChart");
  svg.innerHTML = "";
  const legend = document.getElementById("yearlyTrendLegend");
  legend.innerHTML = `
    <li><span class="swatch" style="background:${cssVar("--series-1")}"></span>수입</li>
    <li><span class="swatch" style="background:${cssVar("--series-8")}"></span>지출</li>
    <li><span class="swatch" style="background:${cssVar("--accent")}"></span>저축률</li>
  `;
  const ns = "http://www.w3.org/2000/svg";
  const W = 900, H = 260, padL = 10, padR = 10, padT = 36, padB = 24;
  const barAreaTop = padT, barAreaBottom = H - padB;
  const maxV = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
  const groupW = (W - padL - padR) / months.length;
  const barW = Math.min(groupW / 2 - 4, 22);

  const baseline = document.createElementNS(ns, "line");
  baseline.setAttribute("x1", padL); baseline.setAttribute("x2", W - padR);
  baseline.setAttribute("y1", barAreaBottom); baseline.setAttribute("y2", barAreaBottom);
  baseline.setAttribute("stroke", cssVar("--baseline"));
  svg.appendChild(baseline);

  const points = [];
  months.forEach((m, i) => {
    const groupX = padL + i * groupW;
    const incH = (m.income / maxV) * (barAreaBottom - barAreaTop);
    const expH = (m.expense / maxV) * (barAreaBottom - barAreaTop);

    const incRect = document.createElementNS(ns, "rect");
    incRect.setAttribute("x", groupX + groupW / 2 - barW - 1);
    incRect.setAttribute("y", barAreaBottom - incH);
    incRect.setAttribute("width", barW); incRect.setAttribute("height", Math.max(incH, 0.5));
    incRect.setAttribute("rx", 3);
    incRect.setAttribute("fill", cssVar("--series-1"));
    svg.appendChild(incRect);

    const expRect = document.createElementNS(ns, "rect");
    expRect.setAttribute("x", groupX + groupW / 2 + 1);
    expRect.setAttribute("y", barAreaBottom - expH);
    expRect.setAttribute("width", barW); expRect.setAttribute("height", Math.max(expH, 0.5));
    expRect.setAttribute("rx", 3);
    expRect.setAttribute("fill", cssVar("--series-8"));
    svg.appendChild(expRect);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", groupX + groupW / 2); label.setAttribute("y", H - 6);
    label.setAttribute("text-anchor", "middle"); label.setAttribute("font-size", "10");
    label.setAttribute("fill", cssVar("--text-secondary"));
    label.textContent = m.month.slice(5);
    svg.appendChild(label);

    const rate = m.income > 0 ? (m.income - m.expense) / m.income * 100 : 0;
    const rateY = padT - 10 + (1 - Math.max(0, Math.min(100, rate)) / 100) * 18;
    points.push({ x: groupX + groupW / 2, y: rateY, rate });
  });

  if (points.length > 1) {
    const path = document.createElementNS(ns, "polyline");
    path.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", cssVar("--accent"));
    path.setAttribute("stroke-width", "2");
    svg.appendChild(path);
  }
  points.forEach((p) => {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.setAttribute("r", 3);
    dot.setAttribute("fill", cssVar("--accent"));
    svg.appendChild(dot);

    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", p.x); t.setAttribute("y", p.y - 8);
    t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "9.5");
    t.setAttribute("fill", cssVar("--accent"));
    t.textContent = `${p.rate.toFixed(1)}%`;
    svg.appendChild(t);
  });
}

function buildYearlySheet(monthlyIncome, monthlyExpense) {
  const header = document.getElementById("yearlySheetHeaderRow");
  header.innerHTML = `<th>대분류</th><th>소분류</th>` +
    Array.from({ length: 12 }, (_, i) => `<th>${i + 1}월</th>`).join("") +
    `<th>합계</th><th>월평균</th>`;

  const tbody = document.querySelector("#yearlySheetTable tbody");
  tbody.innerHTML = "";

  const addSection = (label, monthlyByCategory) => {
    const sectionRow = document.createElement("tr");
    sectionRow.className = "sheet-section-row";
    sectionRow.innerHTML = `<td colspan="16">${label}</td>`;
    tbody.appendChild(sectionRow);

    const majors = {};
    Object.entries(monthlyByCategory).forEach(([full, monthsArr]) => {
      const [major, minor] = splitCategory(full);
      if (!majors[major]) majors[major] = [];
      majors[major].push({ minor, months: monthsArr });
    });

    const sectionTotals = Array(12).fill(0);
    Object.entries(majors).forEach(([major, minors]) => {
      const majorTotals = Array(12).fill(0);
      minors.forEach((m) => m.months.forEach((v, i) => (majorTotals[i] += v)));
      const majorSum = majorTotals.reduce((a, b) => a + b, 0);

      minors.forEach((m, idx) => {
        const tr = document.createElement("tr");
        const sum = m.months.reduce((a, b) => a + b, 0);
        const avg = sum / 12;
        let cells = "";
        if (idx === 0) cells += `<td class="sheet-major-cell" rowspan="${minors.length}">${major}</td>`;
        cells += `<td>${m.minor || "-"}</td>`;
        cells += m.months.map((v) => `<td>${v ? fmtKRW(v).replace("원", "") : "-"}</td>`).join("");
        cells += `<td>${fmtKRW(sum)}</td><td>${fmtKRW(Math.round(avg))}</td>`;
        tr.innerHTML = cells;
        tbody.appendChild(tr);
      });

      const subtotalRow = document.createElement("tr");
      subtotalRow.className = "sheet-subtotal-row";
      subtotalRow.innerHTML = `<td colspan="2">${major} 소계</td>` +
        majorTotals.map((v) => `<td>${v ? fmtKRW(v).replace("원", "") : "-"}</td>`).join("") +
        `<td>${fmtKRW(majorSum)}</td><td>${fmtKRW(Math.round(majorSum / 12))}</td>`;
      tbody.appendChild(subtotalRow);

      majorTotals.forEach((v, i) => (sectionTotals[i] += v));
    });

    const sectionSum = sectionTotals.reduce((a, b) => a + b, 0);
    const totalRow = document.createElement("tr");
    totalRow.className = "sheet-total-row";
    totalRow.innerHTML = `<td colspan="2">${label} 합계</td>` +
      sectionTotals.map((v) => `<td>${v ? fmtKRW(v).replace("원", "") : "-"}</td>`).join("") +
      `<td>${fmtKRW(sectionSum)}</td><td>${fmtKRW(Math.round(sectionSum / 12))}</td>`;
    tbody.appendChild(totalRow);
  };

  addSection("수입", monthlyIncome);
  addSection("지출", monthlyExpense);
}

async function loadYearly() {
  const year = document.getElementById("yearlySelect").value;
  const data = await api(`/transactions/yearly?year=${year}`);
  yearlyData = data;

  document.getElementById("yearlySavingsTitle").textContent = `${year}년 연간결산`;
  renderSavingsDonut(data.total_income, data.total_expense);
  document.querySelector("#yearlySavingsIncome").textContent = fmtKRW(data.total_income);
  document.querySelector("#yearlySavingsExpense").textContent = fmtKRW(data.total_expense);
  const barPct = data.total_income > 0 ? Math.min(100, data.total_expense / data.total_income * 100) : 0;
  document.getElementById("yearlySavingsBarFill").style.width = `${barPct}%`;

  const incomeMajors = majorTotalsOf(data.by_category_income);
  const expenseMajors = majorTotalsOf(data.by_category);
  document.getElementById("yearlyIncomePill").textContent = `수입 ${fmtKRW(data.total_income)}`;
  document.getElementById("yearlyExpensePill").textContent = `지출 ${fmtKRW(data.total_expense)}`;
  document.getElementById("yearlyIncomeAvg").textContent = `월평균 ${fmtKRW(Math.round(data.total_income / 12))}`;
  document.getElementById("yearlyExpenseAvg").textContent = `월평균 ${fmtKRW(Math.round(data.total_expense / 12))}`;
  renderHBarList("yearlyIncomeBars", incomeMajors, data.total_income);
  renderHBarList("yearlyExpenseBars", expenseMajors, data.total_expense, 12);

  const paymentTotals = Object.entries(data.payment_method_totals).sort((a, b) => b[1] - a[1]);
  renderHBarList("yearlyPaymentBars", paymentTotals, data.total_expense);

  renderYearlyTrend(data.months);
  buildYearlySheet(data.monthly_by_category_income, data.monthly_by_category);
}

document.querySelectorAll(".yearly-toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".yearly-toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.querySelector(".yearly-savings-income").classList.toggle("highlight", view === "income");
    document.querySelector(".yearly-savings-expense").classList.toggle("highlight", view === "expense");
  });
});

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
