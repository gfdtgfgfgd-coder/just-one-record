const STORAGE_KEY = "just-one-records-v1";

const categories = {
  expense: ["衣服", "食物", "日用", "出行", "投资"],
  income: ["工资", "兼职", "红包", "退款", "理财"],
};

const chartColors = ["#d9554f", "#2f8f5b", "#d59a2f", "#4f7fbf", "#8f65a8"];

const state = {
  records: [],
  view: "home",
  selectedCategory: "",
  deleteId: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  todayLabel: $("#todayLabel"),
  form: $("#recordForm"),
  recordId: $("#recordId"),
  recordType: $("#recordType"),
  recordDateTime: $("#recordDateTime"),
  recordName: $("#recordName"),
  recordAmount: $("#recordAmount"),
  categoryGrid: $("#categoryGrid"),
  formTitle: $("#formTitle"),
  recentList: $("#recentList"),
  recordList: $("#recordList"),
  monthFilter: $("#monthFilter"),
  backupStatus: $("#backupStatus"),
  importJsonInput: $("#importJsonInput"),
  confirmDialog: $("#confirmDialog"),
  confirmText: $("#confirmText"),
};

function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    state.records = Array.isArray(saved) ? saved : [];
  } catch {
    state.records = [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function toDateTimeLocal(date = new Date()) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 16);
}

function monthKey(date = new Date()) {
  return toDateTimeLocal(date).slice(0, 7);
}

function dayKey(date = new Date()) {
  return toDateTimeLocal(date).slice(0, 10);
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function uid() {
  return `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
}

function sum(records, type) {
  return records.filter((record) => record.type === type).reduce((total, record) => total + Number(record.amount), 0);
}

function getMonthRecords(month) {
  return state.records.filter((record) => record.datetime.slice(0, 7) === month);
}

function sortedRecords(records = state.records) {
  return [...records].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
}

function setView(view) {
  state.view = view;
  $$(".view").forEach((viewEl) => viewEl.classList.toggle("is-active", viewEl.id === `${view}View`));
  $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.nav === view));
  render();
}

function openForm(type, record = null) {
  state.selectedCategory = record?.category || categories[type][0];
  els.formTitle.textContent = record ? "编辑记录" : type === "expense" ? "记支出" : "记收入";
  els.recordId.value = record?.id || "";
  els.recordType.value = type;
  els.recordDateTime.value = record ? toDateTimeLocal(new Date(record.datetime)) : toDateTimeLocal();
  els.recordName.value = record?.name || "";
  els.recordAmount.value = record?.amount || "";
  renderCategories(type);
  setView("form");
  setTimeout(() => els.recordName.focus(), 100);
}

function renderCategories(type) {
  els.categoryGrid.innerHTML = categories[type]
    .map(
      (category) => `
        <button class="category-chip ${category === state.selectedCategory ? "is-selected" : ""}" type="button" data-category="${category}">
          ${category}
        </button>
      `,
    )
    .join("");
}

function renderRecordList(container, records, emptyText) {
  if (!records.length) {
    container.innerHTML = `<p class="empty-text">${emptyText}</p>`;
    return;
  }

  container.innerHTML = records
    .map(
      (record) => `
        <article class="record-item">
          <div>
            <div class="record-title">${escapeHtml(record.name)}</div>
            <div class="record-meta">${record.category} · ${formatDateTime(record.datetime)}</div>
          </div>
          <div class="record-amount ${record.type}">
            ${record.type === "expense" ? "-" : "+"}${money(record.amount)}
          </div>
          <div class="record-item-actions">
            <button type="button" data-edit="${record.id}">编辑</button>
            <button type="button" data-delete="${record.id}">删除</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderStats() {
  const now = new Date();
  const currentMonth = monthKey(now);
  const today = dayKey(now);
  const monthRecords = getMonthRecords(currentMonth);
  const todayRecords = state.records.filter((record) => record.datetime.slice(0, 10) === today);
  const totalIncome = sum(state.records, "income");
  const totalExpense = sum(state.records, "expense");
  const monthIncome = sum(monthRecords, "income");
  const monthExpense = sum(monthRecords, "expense");
  const todayExpense = sum(todayRecords, "expense");

  $("#balanceValue").textContent = money(totalIncome - totalExpense);
  $("#totalIncome").textContent = money(totalIncome);
  $("#totalExpense").textContent = money(totalExpense);
  $("#monthIncome").textContent = money(monthIncome);
  $("#monthExpense").textContent = money(monthExpense);
  $("#todayExpense").textContent = money(todayExpense);
  $("#todayExpenseQuick").textContent = money(todayExpense);
  $("#monthIncomeQuick").textContent = money(monthIncome);

  drawPieChart();
  drawTrendChart();
}

function drawPieChart() {
  const canvas = $("#pieChart");
  const ctx = canvas.getContext("2d");
  const data = categories.expense.map((category) => ({
    category,
    value: sum(state.records.filter((record) => record.category === category), "expense"),
  }));
  const total = data.reduce((amount, item) => amount + item.value, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!total) {
    drawEmptyChart(ctx, canvas, "还没有支出");
    $("#pieLegend").innerHTML = "";
    return;
  }

  const centerX = canvas.width / 2;
  const centerY = 104;
  const radius = 76;
  let start = -Math.PI / 2;
  data.forEach((item, index) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = chartColors[index];
    ctx.fill();
    start += angle;
  });

  $("#pieLegend").innerHTML = data
    .filter((item) => item.value > 0)
    .map((item, index) => `<span><i style="background:${chartColors[index]}"></i>${item.category} ${Math.round((item.value / total) * 100)}%</span>`)
    .join("");
}

function drawTrendChart() {
  const canvas = $("#trendChart");
  const ctx = canvas.getContext("2d");
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = dayKey(date);
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      value: sum(state.records.filter((record) => record.type === "expense" && record.datetime.slice(0, 10) === key), "expense"),
    };
  });
  const max = Math.max(...days.map((item) => item.value), 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!max) {
    drawEmptyChart(ctx, canvas, "最近 7 天没有支出");
    return;
  }

  const pad = 32;
  const chartHeight = 136;
  const baseY = 172;
  ctx.strokeStyle = "#e8e2d8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, baseY);
  ctx.lineTo(canvas.width - pad, baseY);
  ctx.stroke();

  const points = days.map((item, index) => {
    const x = pad + index * ((canvas.width - pad * 2) / 6);
    const y = baseY - (item.value / max) * chartHeight;
    return { ...item, x, y };
  });

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#d9554f";
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = "#fffdf7";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d9554f";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#75706a";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(point.label, point.x, 202);
  });
}

function drawEmptyChart(ctx, canvas, text) {
  ctx.fillStyle = "#75706a";
  ctx.font = "15px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function renderRecords() {
  const activeMonth = els.monthFilter.value || monthKey();
  els.monthFilter.value = activeMonth;
  renderRecordList(els.recordList, sortedRecords(getMonthRecords(activeMonth)), "这个月还没有记录。");
  renderRecordList(els.recentList, sortedRecords().slice(0, 5), "还没有记录，先记一笔。");
}

function render() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  renderStats();
  renderRecords();
}

function upsertRecord(event) {
  event.preventDefault();
  const type = els.recordType.value;
  const record = {
    id: els.recordId.value || uid(),
    type,
    category: state.selectedCategory,
    name: els.recordName.value.trim(),
    amount: Number(els.recordAmount.value),
    datetime: new Date(els.recordDateTime.value).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!record.name || !record.amount || record.amount <= 0) return;

  const index = state.records.findIndex((item) => item.id === record.id);
  if (index >= 0) state.records[index] = { ...state.records[index], ...record };
  else state.records.push({ ...record, createdAt: new Date().toISOString() });
  saveRecords();
  setView("home");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const stamp = dayKey();
  download(`只记一笔-${stamp}.json`, JSON.stringify(state.records, null, 2), "application/json");
}

function exportCsv() {
  const header = ["id", "type", "category", "name", "amount", "datetime"];
  const rows = state.records.map((record) =>
    header.map((key) => `"${String(record[key] ?? "").replaceAll('"', '""')}"`).join(","),
  );
  download(`只记一笔-${dayKey()}.csv`, [header.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

async function importJson(file) {
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) throw new Error("JSON 需要是数组");
    const map = new Map(state.records.map((record) => [record.id, record]));
    imported.forEach((record) => {
      if (record?.id && record?.type && record?.category && record?.datetime) {
        map.set(record.id, { ...record, amount: Number(record.amount) });
      }
    });
    state.records = Array.from(map.values());
    saveRecords();
    els.backupStatus.textContent = `已导入 ${imported.length} 条记录。`;
    render();
  } catch (error) {
    els.backupStatus.textContent = `导入失败：${error.message}`;
  } finally {
    els.importJsonInput.value = "";
  }
}

function bindEvents() {
  $$("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.nav));
  });

  $$("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => openForm(button.dataset.openForm));
  });

  els.categoryGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    renderCategories(els.recordType.value);
  });

  els.form.addEventListener("submit", upsertRecord);
  els.monthFilter.addEventListener("change", renderRecords);

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (editButton) {
      const record = state.records.find((item) => item.id === editButton.dataset.edit);
      if (record) openForm(record.type, record);
    }
    if (deleteButton) {
      state.deleteId = deleteButton.dataset.delete;
      els.confirmDialog.showModal();
    }
  });

  els.confirmDialog.addEventListener("close", () => {
    if (els.confirmDialog.returnValue !== "confirm" || !state.deleteId) return;
    state.records = state.records.filter((record) => record.id !== state.deleteId);
    state.deleteId = "";
    saveRecords();
    render();
  });

  $("#exportJsonButton").addEventListener("click", exportJson);
  $("#exportJsonFullButton").addEventListener("click", exportJson);
  $("#exportCsvButton").addEventListener("click", exportCsv);
  els.importJsonInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch {
    // 本地 file:// 打开时不会注册，使用 localhost 或部署后即可。
  }
}

loadRecords();
bindEvents();
render();
registerServiceWorker();
