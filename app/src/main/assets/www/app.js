/* ============================================================
   منطق کامل رابط کاربری موبایل اندروید — سامانه مدیریت سفارش و انبار
   ============================================================ */

const STATE = {
  page: "dashboard",
  orderPill: "همه",
  finTab: "payments",
  custTab: "crm",
  repTab: "top",
  setTab: "brand",
  // فرم سفارش فعال داخل مودال
  editingOrderId: null,
  orderItems: [],
  orderPriceGroup: "خرده‌فروشی",
  orderCreditLimit: 0,
  orderCustDebt: 0,
  // استودیو فاکتور
  invOrderId: null,
  invStatus: "فعال",
  invAccent: "#2F6F5E",
  invPriceGroup: "خرده‌فروشی",
  invCreditLimit: 0,
  invCustDebt: 0,
  invItems: [],
  // لاک مودال و اسکنر دوربین
  cameraStream: null,
  stockPickerTarget: null,
  tempOrderDraft: null
};

const PAGE_TITLES = {
  dashboard: "داشبورد مدیریتی",
  orders: "مدیریت سفارش‌ها",
  inventory: "کالاها و انبار برچسب",
  invoices: "استودیو فاکتور",
  finance: "مالی و چک‌های صیادی",
  customers: "اشخاص و مشتریان",
  reports: "گزارشات و سودآوری",
  settings: "تنظیمات و پشتیبان‌گیری"
};

const ORDER_PILLS = [
  "همه", "سفارش‌های امروز", "سفارش‌های باز", "در انتظار طراحی",
  "در مرحله چاپ و برش", "ارسال و تحویل‌شده", "بدهکار (مانده‌دار)", "لغو / مرجوعی"
];

// ============================================================
// پل ارتباطی با اندروید بومی (AndroidBridge) + Fallback مرورگر
// ============================================================

function toast(msg, kind = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { el.className = "toast"; }, 3000);
}

function nativeShareText(text) {
  if (window.AndroidBridge && typeof window.AndroidBridge.shareText === "function") {
    window.AndroidBridge.shareText(text);
    return;
  }
  if (navigator.share) {
    navigator.share({ text }).catch(() => copyFallback(text));
  } else {
    copyFallback(text);
  }
}

function copyFallback(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast("در کلیپ‌بورد کپی شد ✅"));
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("در کلیپ‌بورد کپی شد ✅");
  }
}

function nativePrintHtml(html, jobName = "Invoice") {
  if (window.AndroidBridge && typeof window.AndroidBridge.printHtml === "function") {
    window.AndroidBridge.printHtml(html, jobName);
    return;
  }
  const pa = document.getElementById("print-area");
  pa.innerHTML = html;
  pa.style.display = "block";
  window.print();
  setTimeout(() => { pa.style.display = "none"; }, 500);
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === "function") {
    window.AndroidBridge.saveFile(filename, content, mime);
    toast(`فایل ${filename} در پوشه Downloads ذخیره شد ✅`);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`فایل ${filename} دانلود شد ✅`);
}

// دکمه Back سخت‌افزاری اندروید
window.handleAndroidBack = function () {
  if (document.getElementById("modal-backdrop").classList.contains("open")) {
    closeModal();
    return true;
  }
  if (document.getElementById("drawer").classList.contains("open")) {
    toggleDrawer(false);
    return true;
  }
  if (STATE.page !== "dashboard") {
    goPage("dashboard");
    return true;
  }
  return false;
};

// ============================================================
// راه‌اندازی اولیه
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  initStaticSelects();
  applySavedAppearance();

  const s = DB.getSettings();
  if (s.enable_login_lock === "1") {
    document.getElementById("login-overlay").classList.add("open");
  }

  // بازیابی پیش‌نویس فاکتور
  if (!restoreInvoiceDraft()) {
    resetInvoiceForm(true);
  }
  refreshAll();
  initCloudSyncEngine();
});

function initStaticSelects() {
  const msgSel = document.getElementById("ord-msg-filter");
  MESSENGERS.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    msgSel.appendChild(opt);
  });

  const pillsDiv = document.getElementById("ord-pills");
  pillsDiv.innerHTML = ORDER_PILLS.map(p =>
    `<button class="pill ${p === "همه" ? "active" : ""}" onclick="selectOrderPill('${p}')">${p}</button>`
  ).join("");

  const invTypeSel = document.getElementById("inv-type");
  invTypeSel.innerHTML = `<option value="همه">همه انواع کالا</option>` + PRODUCT_TYPES.map(t => `<option value="${t}">${t}</option>`).join("");

  const invDocSel = document.getElementById("inv-doc-type");
  invDocSel.innerHTML = INVOICE_TYPES.map(t => `<option value="${t}">${t}</option>`).join("");

  ["inv-discount", "inv-shipping", "inv-paid"].forEach(id => attachMoneyFormatting(document.getElementById(id)));
}

function applySavedAppearance() {
  const s = DB.getSettings();
  const dark = s.ui_dark_mode === "1";
  document.body.classList.toggle("dark", dark);
  document.getElementById("btn-dark-toggle").textContent = dark ? "☀️" : "🌙";
  const fsz = s.ui_font_size || "14";
  document.documentElement.style.setProperty("--font-size", `${fsz}px`);
  const fSel = document.getElementById("set-fontsize");
  if (fSel) fSel.value = fsz;
}

function toggleDarkMode() {
  const dark = !document.body.classList.contains("dark");
  DB.saveSettings({ ui_dark_mode: dark ? "1" : "0" });
  applySavedAppearance();
  toast(dark ? "حالت تاریک فعال شد 🌙" : "حالت روشن فعال شد ☀️");
}

function applyFontSize(sz) {
  DB.saveSettings({ ui_font_size: String(sz) });
  applySavedAppearance();
}

function doLogin() {
  const u = document.getElementById("login-user").value;
  const p = document.getElementById("login-pass").value;
  const user = DB.authenticateUser(u, p);
  if (!user) {
    toast("نام کاربری یا رمز عبور اشتباه است", "error");
    return;
  }
  document.getElementById("login-overlay").classList.remove("open");
  refreshAll();
  toast(`خوش آمدید ${user.full_name} 👋`);
}

function toggleDrawer(open) {
  document.getElementById("drawer").classList.toggle("open", open);
  document.getElementById("drawer-backdrop").classList.toggle("open", open);
}

function goPage(page) {
  STATE.page = page;
  toggleDrawer(false);
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
  document.querySelectorAll(".bnav-btn").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  document.querySelectorAll(".drawer-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  document.getElementById("top-title").textContent = PAGE_TITLES[page] || "مدیریت سفارش";
  document.getElementById("fab-new-order").style.display = ["dashboard", "orders"].includes(page) ? "inline-flex" : "none";
  window.scrollTo(0, 0);

  if (page === "dashboard") renderDashboard();
  else if (page === "orders") renderOrders();
  else if (page === "inventory") renderInventory();
  else if (page === "invoices") { refreshInvoiceDropdowns(); renderInvoicePreview(); }
  else if (page === "finance") renderFinance();
  else if (page === "customers") renderCustomers();
  else if (page === "reports") renderReports();
  else if (page === "settings") renderSettings();
}

function refreshAll() {
  const s = DB.getSettings();
  document.getElementById("drawer-brand").textContent = s.brand_name;
  document.getElementById("drawer-ver").textContent = `نسخه ${APP_VERSION} • ${DB.currentUser.role}`;
  document.getElementById("top-sub").textContent = `${s.brand_name} • امروز ${getTodayJalali()}`;

  // به‌روزرسانی لیست انبارها
  const whSel = document.getElementById("inv-wh");
  const prevWh = whSel.value || "همه";
  whSel.innerHTML = `<option value="همه">همه انبارها</option>` + DB.getWarehouses().map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join("");
  whSel.value = prevWh;

  renderDashboard();
  renderOrders();
  renderInventory();
  refreshInvoiceDropdowns();
  renderFinance();
  renderCustomers();
  renderReports();
  renderSettings();
}

function setTodayField(id, cb) {
  const el = document.getElementById(id);
  if (el) { el.value = getTodayJalali(); if (cb) cb(); }
}

// ============================================================
// مودال عمومی و اسکنر بارکد با دوربین گوشی
// ============================================================

function openModal(title, bodyHtml, footHtml) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-foot").innerHTML = footHtml || "";
  document.getElementById("modal-backdrop").classList.add("open");
}

function closeModal() {
  stopCameraStream();
  document.getElementById("modal-backdrop").classList.remove("open");
}

function stopCameraStream() {
  if (STATE.cameraStream) {
    STATE.cameraStream.getTracks().forEach(t => t.stop());
    STATE.cameraStream = null;
  }
}

async function scanBarcodeInto(inputId, onFoundCb) {
  const manual = () => {
    const code = prompt("کد بارکد یا SKU کالا را وارد کنید:");
    if (code && code.trim()) {
      const el = document.getElementById(inputId);
      if (el) el.value = code.trim();
      if (onFoundCb) onFoundCb(code.trim());
    }
  };
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    manual();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    STATE.cameraStream = stream;
    openModal("📷 اسکن بارکد با دوربین", `
      <video id="cam-video" autoplay playsinline style="width:100%;border-radius:12px;background:#000;max-height:320px;"></video>
      <p style="text-align:center;font-size:12px;color:var(--muted);margin-top:8px;">بارکد رول برچسب را مقابل دوربین بگیرید...</p>
    `, `<button class="btn btn-secondary" onclick="closeModal()">انصراف</button>`);
    const video = document.getElementById("cam-video");
    video.srcObject = stream;
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a"] });
    const tick = async () => {
      if (!STATE.cameraStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          const val = codes[0].rawValue;
          closeModal();
          const el = document.getElementById(inputId);
          if (el) el.value = val;
          toast(`بارکد اسکن شد: ${val} ✅`);
          if (onFoundCb) onFoundCb(val);
          return;
        }
      } catch (e) {}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    manual();
  }
}

function scanBarcodeForTarget(target) {
  if (target === "order") STATE.tempOrderDraft = captureOrderModalSnapshot();
  const applyCode = (code) => {
    const prod = DB.getProductByBarcodeOrSku(code);
    if (!prod) {
      toast(`کالایی با کد «${code}» پیدا نشد`, "warning");
      if (target === "order" && STATE.tempOrderDraft) openOrderModal(STATE.editingOrderId, null, true);
      return;
    }
    if (target === "order") {
      addWarehouseProductToOrder(prod, 1);
      if (STATE.tempOrderDraft) STATE.tempOrderDraft.items = STATE.orderItems.map(x => ({ ...x }));
      openOrderModal(STATE.editingOrderId, null, true);
      toast(`${prod.name} با بارکد اضافه شد ✅`);
    } else if (target === "invoice") {
      addWarehouseProductToInvoice(prod, 1);
      toast(`${prod.name} با بارکد اضافه شد ✅`);
    }
  };
  scanBarcodeInto("__none__", applyCode);
}

// ============================================================
// ۱. داشبورد مدیریتی
// ============================================================

function renderDashboard() {
  const s = DB.getDashboardStats();
  document.getElementById("dash-kpis").innerHTML = `
    <div class="kpi-card">
      <div class="k-label">فروش کل</div>
      <div class="k-val" style="color:var(--primary)">${formatMoney(s.total_sales)} ت</div>
      <div class="k-sub">${s.total_orders} سفارش فعال</div>
    </div>
    <div class="kpi-card">
      <div class="k-label">سود ناخالص</div>
      <div class="k-val" style="color:var(--success)">${formatMoney(s.gross_profit)} ت</div>
      <div class="k-sub">طراحی/کلیشه: ${formatMoney(s.total_design)} ت</div>
    </div>
    <div class="kpi-card">
      <div class="k-label">مانده مشتریان</div>
      <div class="k-val" style="color:var(--danger)">${formatMoney(s.total_remaining)} ت</div>
      <div class="k-sub">دریافتی: ${formatMoney(s.total_received)} ت</div>
    </div>
    <div class="kpi-card">
      <div class="k-label">چاپ / هشدارها</div>
      <div class="k-val" style="color:var(--warn)">${s.active_orders} باز</div>
      <div class="k-sub">${s.low_stock_count} کم‌موجودی • ${s.open_checks_count} چک</div>
    </div>
  `;

  const alerts = DB.getSmartAlerts();
  document.getElementById("dash-alerts").innerHTML = alerts.length
    ? alerts.map(a => `<div class="alert-box ${a.kind === "low_stock" ? "alert-danger" : "alert-warn"}">${a.kind === "low_stock" ? "⚠️" : "📅"} ${escapeHtml(a.text)}</div>`).join("")
    : `<div class="alert-box alert-success">✅ همه موجودی‌های انبار و چک‌ها در وضعیت مطلوب هستند.</div>`;

  const msgs = DB.getMessengerBreakdown();
  const maxSale = Math.max(...msgs.map(m => m.sales), 1);
  document.getElementById("dash-messengers").innerHTML = msgs.length
    ? msgs.map(m => `
        <div class="bar-row">
          <div class="bar-head"><span>${escapeHtml(m.messenger)} (${m.cnt})</span><span>${formatMoney(m.sales)} ت</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, Math.round((m.sales / maxSale) * 100))}%"></div></div>
        </div>`).join("")
    : `<div class="empty-state">هنوز سفارشی ثبت نشده است</div>`;

  const totalO = Math.max(s.total_orders, 1);
  const pipe = [
    ["دریافت طرح / پیش‌نویس", s.st_receive, "#6366F1"],
    ["تأیید طرح", s.st_approve, "#8B5CF6"],
    ["چاپ و برش / رول‌پیچی", s.st_print, "#D97706"],
    ["بسته‌بندی", s.st_pack, "#0EA5E9"],
    ["ارسال و تحویل‌شده", s.st_ship, "#2F6F5E"]
  ];
  document.getElementById("dash-pipeline").innerHTML = pipe.map(([lbl, cnt, col]) => `
    <div class="bar-row">
      <div class="bar-head"><span>${lbl}</span><span>${cnt} سفارش (${Math.round((cnt / totalO) * 100)}%)</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${cnt ? Math.max(5, Math.round((cnt / totalO) * 100)) : 0}%;background:${col}"></div></div>
    </div>`).join("");

  const urgent = DB.getUrgentOrders();
  document.getElementById("dash-urgent").innerHTML = urgent.length
    ? urgent.map(o => {
        const b = getStatusBadge(o.workflow_status);
        return `
          <div class="item-card" onclick="openOrderModal(${o.id})" style="cursor:pointer;">
            <div class="item-card-head">
              <div><span class="item-title">#${o.id} — ${escapeHtml(o.customer_name)}</span>
                <div class="item-meta">${escapeHtml(o.product_title)} • ${escapeHtml(o.messenger)}</div>
              </div>
              <span class="badge ${b.cls}">${b.label}</span>
            </div>
            <div class="item-money-row">
              <span>مانده: <b style="color:${o.remaining_amount > 0 ? "var(--danger)" : "var(--success)"}">${o.remaining_amount > 0 ? formatMoney(o.remaining_amount) + " ت" : "تسویه ✅"}</b></span>
              <span>تحویل: ${escapeHtml(o.delivery_date || "-")}</span>
            </div>
          </div>`;
      }).join("")
    : `<div class="empty-state">🎉 هیچ سفارش باز یا بدهکاری وجود ندارد!</div>`;
}

// ============================================================
// ۲. مدیریت سفارش‌ها + دیالوگ چندردیفه سفارش
// ============================================================

function selectOrderPill(pill) {
  STATE.orderPill = pill;
  document.querySelectorAll("#ord-pills .pill").forEach(b => b.classList.toggle("active", b.textContent === pill));
  renderOrders();
}

function renderOrders() {
  const rows = DB.fetchOrders({
    search: document.getElementById("ord-search").value,
    order_kind: document.getElementById("ord-kind-filter").value,
    messenger: document.getElementById("ord-msg-filter").value,
    status_pill: STATE.orderPill
  });

  const sumTot = rows.reduce((a, r) => a + (Number(r.total_price) || 0), 0);
  const sumRem = rows.reduce((a, r) => a + (Number(r.remaining_amount) || 0), 0);
  document.getElementById("ord-footer-summary").innerHTML = `
    <span>تعداد: ${rows.length} سفارش</span>
    <span>جمع کل: ${formatMoney(sumTot)} ت</span>
    <span style="color:var(--danger)">مانده: ${formatMoney(sumRem)} ت</span>
  `;

  if (!rows.length) {
    document.getElementById("orders-list").innerHTML = `
      <div class="card empty-state">
        <div style="font-size:32px;margin-bottom:8px;">📦</div>
        <div>سفارشی با این فیلتر پیدا نشد</div>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="openOrderModal()">+ ثبت اولین سفارش</button>
      </div>`;
    return;
  }

  document.getElementById("orders-list").innerHTML = rows.map(o => {
    const b = getStatusBadge(o.workflow_status);
    const qtySummary = summarizeOrderItems(o.items);
    const stageOpts = ORDER_WORKFLOW_STAGES.map(st => `<option value="${st}" ${st === o.workflow_status ? "selected" : ""}>${st}</option>`).join("");
    return `
      <div class="item-card">
        <div class="item-card-head">
          <div>
            <div class="item-title">#${o.id} — ${escapeHtml(o.customer_name)}</div>
            <div class="item-meta">${escapeHtml(o.order_date)} • ${escapeHtml(o.messenger)} • ${escapeHtml(o.order_kind)}</div>
            <div class="item-meta"><b>${escapeHtml(o.product_title)}</b> (${escapeHtml(qtySummary)})</div>
          </div>
          <span class="badge ${b.cls}">${b.label}</span>
        </div>
        <div class="item-money-row">
          <span>کل: <b>${formatMoney(o.total_price)} ت</b></span>
          <span>بیعانه: <b style="color:var(--success)">${formatMoney(o.deposit_amount)} ت</b></span>
          <span>مانده: <b style="color:${o.remaining_amount > 0 ? "var(--danger)" : "var(--success)"}">${o.remaining_amount > 0 ? formatMoney(o.remaining_amount) + " ت" : "تسویه ✅"}</b></span>
        </div>
        <div class="row-nowrap" style="margin-bottom:6px;">
          <select class="flex-1" style="min-height:36px;font-size:12px;" onchange="quickChangeOrderStatus(${o.id}, this.value)">${stageOpts}</select>
          ${o.remaining_amount > 0 ? `<button class="btn btn-sm btn-success" onclick="quickPayOrder(${o.id})">تسویه</button>` : ""}
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-secondary" onclick="openOrderModal(${o.id})">✏️ ویرایش</button>
          <button class="btn btn-sm btn-secondary" onclick="openOrderModal(null, ${o.id})">🔁 تکرار</button>
          <button class="btn btn-sm btn-primary" onclick="sendOrderToInvoice(${o.id})">🧾 فاکتور</button>
          <button class="btn btn-sm btn-secondary" onclick="shareOrderSummary(${o.id})">📤 ارسال پیام</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOrderConfirm(${o.id})">🗑️</button>
        </div>
      </div>`;
  }).join("");
}

function quickChangeOrderStatus(oid, newStatus) {
  DB.advanceWorkflowStatus(oid, newStatus);
  refreshAll();
  toast(`وضعیت سفارش #${oid} به «${newStatus}» تغییر یافت`);
}

function quickPayOrder(oid) {
  DB.markOrderPaid(oid);
  refreshAll();
  toast(`سفارش #${oid} تسویه کامل شد ✅`);
}

function deleteOrderConfirm(oid) {
  if (confirm(`آیا از حذف کامل سفارش #${oid} مطمئن هستید؟`)) {
    DB.deleteOrder(oid);
    refreshAll();
    toast("سفارش حذف شد", "warning");
  }
}

function sendOrderToInvoice(oid) {
  loadOrderIntoInvoice(oid);
  goPage("invoices");
  toast(`اطلاعات سفارش #${oid} به استودیو فاکتور منتقل شد`);
}

function shareOrderSummary(oid) {
  const o = DB.getOrder(oid);
  if (!o) return;
  const s = DB.getSettings();
  const lines = [
    `✨ ${s.brand_name}`,
    `🧾 صورتحساب سفارش #${o.id} (${o.order_kind})`,
    "━━━━━━━━━━━━━━",
    `👤 مشتری گرامی: ${o.customer_name}`
  ];
  if (o.items && o.items.length) {
    lines.push("📦 اقلام سفارش:");
    o.items.forEach((it, idx) => {
      const sp = it.spec ? ` [${it.spec}]` : "";
      lines.push(`  ${idx + 1}. ${it.title}${sp} (${formatQty(it.quantity)} ${it.unit} × ${formatMoney(it.unit_price)}) ⇐ ${formatMoney(it.total)} تومان`);
    });
  }
  if (o.design_cost > 0) lines.push(`🎨 طراحی: ${formatMoney(o.design_cost)} ت`);
  if (o.cliche_cost > 0) lines.push(`🖨️ کلیشه: ${formatMoney(o.cliche_cost)} ت`);
  if (o.packaging_cost > 0) lines.push(`📦 بسته‌بندی: ${formatMoney(o.packaging_cost)} ت`);
  if (o.discount > 0) lines.push(`🎁 تخفیف: ${formatMoney(o.discount)} ت`);
  if (o.shipping_cost > 0) lines.push(`🚚 ارسال: ${formatMoney(o.shipping_cost)} ت`);
  lines.push(
    "━━━━━━━━━━━━━━",
    `💰 مبلغ کل: ${formatMoney(o.total_price)} تومان`,
    `💳 پرداختی/بیعانه: ${formatMoney(o.deposit_amount)} تومان`,
    `📌 مانده: ${o.remaining_amount <= 0 ? "تسویه کامل ✅" : formatMoney(o.remaining_amount) + " تومان"}`,
    `📊 وضعیت: ${o.workflow_status}`
  );
  if (o.tracking_code) lines.push(`📮 کد رهگیری: ${o.tracking_code}`);
  if (o.remaining_amount > 0 && s.bank_card) {
    lines.push("━━━━━━━━━━━━━━", `🏦 کارت: ${s.bank_card}`, `به نام: ${s.bank_owner}`);
  }
  nativeShareText(lines.join("\n"));
}


function captureOrderModalSnapshot() {
  const nameEl = document.getElementById("om-name");
  if (!nameEl) return null;
  return {
    customer_name: nameEl.value,
    phone: document.getElementById("om-phone")?.value || "",
    address: document.getElementById("om-addr")?.value || "",
    messenger: document.getElementById("om-messenger")?.value || "واتساپ",
    order_kind: document.getElementById("om-kind")?.value || "چاپ سفارشی",
    marketer_name: document.getElementById("om-marketer")?.value || "",
    order_date: document.getElementById("om-date")?.value || getTodayJalali(),
    delivery_date: document.getElementById("om-deliv")?.value || "",
    design_cost: parseNumber(document.getElementById("om-design")?.value),
    cliche_cost: parseNumber(document.getElementById("om-cliche")?.value),
    packaging_cost: parseNumber(document.getElementById("om-pack")?.value),
    discount: parseNumber(document.getElementById("om-disc")?.value),
    shipping_cost: parseNumber(document.getElementById("om-ship")?.value),
    deposit_amount: parseNumber(document.getElementById("om-deposit")?.value),
    workflow_status: document.getElementById("om-wf")?.value || "دریافت طرح",
    tracking_code: document.getElementById("om-track")?.value || "",
    notes: document.getElementById("om-notes")?.value || "",
    stock_deducted: document.getElementById("om-deduct")?.checked || false,
    items: STATE.orderItems.map(x => ({ ...x }))
  };
}

function openOrderModal(editId = null, repeatFromId = null, useTempDraft = false) {
  STATE.editingOrderId = editId;
  STATE.orderPriceGroup = "خرده‌فروشی";
  STATE.orderCreditLimit = 0;
  STATE.orderCustDebt = 0;

  let source = null;
  let isRepeat = false;
  if (useTempDraft && STATE.tempOrderDraft) {
    source = STATE.tempOrderDraft;
    STATE.tempOrderDraft = null;
  } else if (editId) {
    source = DB.getOrder(editId);
  } else if (repeatFromId) {
    source = DB.getOrder(repeatFromId);
    isRepeat = true;
  } else {
    try {
      const dr = JSON.parse(localStorage.getItem("draft_order_android") || "null");
      if (dr) source = dr;
    } catch (e) {}
  }

  STATE.orderItems = source && source.items && source.items.length
    ? source.items.map(x => ({ ...x }))
    : [{ product_id: null, title: "", spec: "", calc_type: "متری", unit: "متر", quantity: 1, unit_price: 0, cost_price: 0, total: 0 }];

  const custs = DB.getAllCustomersDirectory();
  const custOpts = `<option value="">— انتخاب مشتری قبلی —</option>` + custs.map(c =>
    `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} ${c.phone ? "| " + escapeHtml(c.phone) : ""} (${c.price_group || "خرده"})</option>`
  ).join("");
  const mktOpts = `<option value="">بدون بازاریاب</option>` + DB.getMarketers().map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

  const title = editId ? `ویرایش سفارش #${editId}` : (isRepeat ? "تکرار سفارش مشتری" : "ثبت سفارش جدید");
  openModal(title, `
    <div id="om-info-badge" class="alert-box alert-success" style="display:none;"></div>
    <div id="om-warn-badge" class="alert-box alert-danger" style="display:none;"></div>

    <div class="field-group">
      <label>انتخاب سریع مشتری قبلی</label>
      <div class="row-nowrap">
        <select id="om-cust-pick" class="flex-1" onchange="onOrderCustPicked(this.value)">${custOpts}</select>
        <button class="btn btn-sm btn-secondary" onclick="quickAddCustomerFromOrder()">+ مشتری</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="field-group"><label>نام مشتری *</label><input type="text" id="om-name" value="${escapeHtml(source ? source.customer_name : "")}" oninput="onOrderFormChanged()" /></div>
      <div class="field-group"><label>شماره تماس</label><input type="tel" id="om-phone" value="${escapeHtml(source ? source.phone : "")}" oninput="onOrderFormChanged()" /></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>کانال / پیام‌رسان</label>
        <select id="om-messenger">${MESSENGERS.map(m => `<option value="${m}" ${(source && source.messenger === m) ? "selected" : ""}>${m}</option>`).join("")}</select>
      </div>
      <div class="field-group"><label>نوع سفارش</label>
        <select id="om-kind">${ORDER_KINDS.map(k => `<option value="${k}" ${(source && source.order_kind === k) ? "selected" : ""}>${k}</option>`).join("")}</select>
      </div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>گروه قیمتی</label>
        <select id="om-pg" onchange="onOrderPriceGroupChange(this.value)">
          <option value="خرده‌فروشی">خرده‌فروشی</option>
          <option value="عمده‌فروشی">عمده‌فروشی</option>
          <option value="همکار">همکار</option>
        </select>
      </div>
      <div class="field-group"><label>بازاریاب</label><select id="om-marketer">${mktOpts}</select></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>تاریخ ثبت</label><input type="text" id="om-date" value="${escapeHtml(isRepeat ? getTodayJalali() : (source && source.order_date ? source.order_date : getTodayJalali()))}" /></div>
      <div class="field-group"><label>موعد تحویل</label>
        <div class="row-nowrap">
          <input type="text" id="om-deliv" class="flex-1" value="${escapeHtml(isRepeat ? "" : (source ? source.delivery_date || "" : ""))}" placeholder="1405/09/15" />
          <button class="btn btn-sm btn-secondary" onclick="document.getElementById('om-deliv').value=getTodayJalali(3)">+۳روز</button>
        </div>
      </div>
    </div>
    <div class="field-group"><label>آدرس / اطلاعات ارسال</label><input type="text" id="om-addr" value="${escapeHtml(source ? source.address || "" : "")}" /></div>

    <div class="card" style="padding:10px;">
      <div class="card-title">
        <span>📦 اقلام سفارش</span>
        <div class="row-nowrap">
          <button class="btn btn-sm btn-primary" onclick="openStockPicker('order')">📦 از انبار</button>
          <button class="btn btn-sm btn-secondary" onclick="scanBarcodeForTarget('order')">📷 بارکد</button>
        </div>
      </div>
      <div class="row-flex" style="margin-bottom:8px;">
        <button class="btn btn-sm btn-success flex-1" onclick="addOrderLineItem('متری','متر')">+ متری</button>
        <button class="btn btn-sm btn-secondary flex-1" onclick="addOrderLineItem('عددی','رول')">+ عددی/رول</button>
      </div>
      <div id="om-items-wrap"></div>
    </div>

    <div class="grid-2">
      <div class="field-group"><label>هزینه طراحی (تومان)</label><input type="text" inputmode="numeric" id="om-design" value="${formatMoney(isRepeat ? 0 : (source ? source.design_cost : 0))}" oninput="onOrderFormChanged()" /></div>
      <div class="field-group"><label>هزینه کلیشه (تومان)</label><input type="text" inputmode="numeric" id="om-cliche" value="${formatMoney(isRepeat ? 0 : (source ? source.cliche_cost : 0))}" oninput="onOrderFormChanged()" /></div>
      <div class="field-group"><label>بسته‌بندی</label><input type="text" inputmode="numeric" id="om-pack" value="${formatMoney(source ? source.packaging_cost : 0)}" oninput="onOrderFormChanged()" /></div>
      <div class="field-group"><label>تخفیف</label><input type="text" inputmode="numeric" id="om-disc" value="${formatMoney(source ? source.discount : 0)}" oninput="onOrderFormChanged()" /></div>
      <div class="field-group"><label>هزینه ارسال</label><input type="text" inputmode="numeric" id="om-ship" value="${formatMoney(source ? source.shipping_cost : 0)}" oninput="onOrderFormChanged()" /></div>
      <div class="field-group"><label>بیعانه / پرداختی</label><input type="text" inputmode="numeric" id="om-deposit" value="${formatMoney(isRepeat ? 0 : (source ? source.deposit_amount : 0))}" oninput="onOrderFormChanged()" /></div>
    </div>

    <div id="om-summary" class="footer-summary"></div>

    <div class="grid-2">
      <div class="field-group"><label>وضعیت چاپ / تولید</label>
        <select id="om-wf">${ORDER_WORKFLOW_STAGES.map(st => `<option value="${st}" ${((!isRepeat && source && source.workflow_status === st) || (!source && st === "دریافت طرح")) ? "selected" : ""}>${st}</option>`).join("")}</select>
      </div>
      <div class="field-group"><label>کد رهگیری ارسال</label><input type="text" id="om-track" value="${escapeHtml(isRepeat ? "" : (source ? source.tracking_code || "" : ""))}" /></div>
    </div>
    <div class="field-group"><label>توضیحات</label><input type="text" id="om-notes" value="${escapeHtml(source ? source.notes || "" : "")}" /></div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;">
      <input type="checkbox" id="om-deduct" style="width:20px;height:20px;" ${source && source.stock_deducted && !isRepeat ? "checked disabled" : ""} />
      ${source && source.stock_deducted && !isRepeat ? "✓ موجودی از انبار کسر شده است" : "کسر خودکار موجودی کالاهای انتخابی از انبار"}
    </label>
  `, `
    ${!editId ? `<button class="btn btn-secondary" onclick="clearOrderDraftAndReset()">پاک کردن</button>` : ""}
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitOrderForm()">💾 ثبت نهایی سفارش</button>
  `);

  if (source && source.marketer_name) document.getElementById("om-marketer").value = source.marketer_name;
  ["om-design", "om-cliche", "om-pack", "om-disc", "om-ship", "om-deposit"].forEach(id => attachMoneyFormatting(document.getElementById(id)));
  renderOrderItemsUI();
  updateOrderModalTotals();
}

function quickAddCustomerFromOrder() {
  const name = prompt("نام مشتری جدید را وارد کنید:");
  if (!name || !name.trim()) return;
  const phone = prompt("شماره تماس مشتری (اختیاری):") || "";
  DB.upsertParty({ party_type: "مشتری", name: name.trim(), phone: phone.trim(), messenger: "واتساپ", price_group: "خرده‌فروشی" });
  document.getElementById("om-name").value = name.trim();
  document.getElementById("om-phone").value = phone.trim();
  toast(`مشتری «${name.trim()}» اضافه شد ✅`);
}

function onOrderCustPicked(name) {
  if (!name) return;
  const cust = DB.getAllCustomersDirectory().find(c => c.name === name);
  if (!cust) return;
  document.getElementById("om-name").value = cust.name;
  if (cust.phone) document.getElementById("om-phone").value = cust.phone;
  if (cust.address) document.getElementById("om-addr").value = cust.address;
  if (cust.messenger) document.getElementById("om-messenger").value = cust.messenger;
  if (cust.marketer_name) document.getElementById("om-marketer").value = cust.marketer_name;
  STATE.orderPriceGroup = cust.price_group || "خرده‌فروشی";
  document.getElementById("om-pg").value = STATE.orderPriceGroup;
  STATE.orderCreditLimit = Number(cust.credit_limit) || 0;
  STATE.orderCustDebt = DB.getCustomerDebt(cust.name);
  const badge = document.getElementById("om-info-badge");
  badge.textContent = `✓ ${cust.name} (${STATE.orderPriceGroup}) | مانده قبلی: ${formatMoney(STATE.orderCustDebt)} ت`;
  badge.style.display = "block";
  updateOrderModalTotals();
}

function onOrderPriceGroupChange(pg) {
  STATE.orderPriceGroup = pg;
  STATE.orderItems.forEach(it => {
    if (it.product_id) {
      const p = DB.getProduct(it.product_id);
      if (p) {
        it.unit_price = getTieredPrice(p, pg, it.quantity);
        it.total = it.quantity * it.unit_price;
      }
    }
  });
  renderOrderItemsUI();
  updateOrderModalTotals();
}

function addOrderLineItem(calcType, unit) {
  STATE.orderItems.push({ product_id: null, title: "", spec: "", calc_type: calcType, unit, quantity: 1, unit_price: 0, cost_price: 0, total: 0 });
  renderOrderItemsUI();
  updateOrderModalTotals();
}

function addWarehouseProductToOrder(prod, qty) {
  const price = getTieredPrice(prod, STATE.orderPriceGroup, qty);
  const spec = buildProductSpecText(prod);
  const unit = prod.unit_main || "رول";
  const calcType = unit === "متر" ? "متری" : "عددی";
  if (STATE.orderItems.length === 1 && !STATE.orderItems[0].title && !STATE.orderItems[0].unit_price) {
    STATE.orderItems = [];
  }
  STATE.orderItems.push({
    product_id: prod.id, title: prod.name, spec, calc_type: calcType, unit,
    quantity: qty, unit_price: price, cost_price: Number(prod.cost_price) || 0, total: qty * price
  });
  const ded = document.getElementById("om-deduct");
  if (ded && !ded.disabled) ded.checked = true;
  renderOrderItemsUI();
  updateOrderModalTotals();
}

function renderOrderItemsUI() {
  const wrap = document.getElementById("om-items-wrap");
  if (!wrap) return;
  wrap.innerHTML = STATE.orderItems.map((it, idx) => `
    <div class="line-item-box">
      <div class="row-nowrap" style="margin-bottom:6px;">
        <input type="text" class="flex-1" placeholder="شرح کالا / محصول" value="${escapeHtml(it.title)}" oninput="updateOrderItemField(${idx},'title',this.value)" />
        <button class="btn btn-sm btn-danger" onclick="removeOrderLineItem(${idx})">✕</button>
      </div>
      <div class="grid-3">
        <input type="text" placeholder="مشخصات/سایز" value="${escapeHtml(it.spec)}" oninput="updateOrderItemField(${idx},'spec',this.value)" />
        <input type="number" step="any" placeholder="مقدار" value="${it.quantity}" oninput="updateOrderItemField(${idx},'quantity',this.value)" />
        <input type="text" inputmode="numeric" placeholder="فی (تومان)" value="${formatMoney(it.unit_price)}" oninput="updateOrderItemField(${idx},'unit_price',this.value)" />
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:5px;color:var(--muted);">
        <span>واحد: ${escapeHtml(it.unit)} (${it.calc_type})</span>
        <b style="color:var(--primary)">جمع ردیف: ${formatMoney(it.quantity * it.unit_price)} ت</b>
      </div>
    </div>
  `).join("");
}

function updateOrderItemField(idx, field, val) {
  const it = STATE.orderItems[idx];
  if (!it) return;
  if (field === "quantity") {
    it.quantity = parseNumber(val);
    if (it.product_id) {
      const p = DB.getProduct(it.product_id);
      if (p) it.unit_price = getTieredPrice(p, STATE.orderPriceGroup, it.quantity);
    }
  } else if (field === "unit_price") {
    it.unit_price = parseNumber(val);
  } else {
    it[field] = val;
  }
  it.total = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  onOrderFormChanged();
}

function removeOrderLineItem(idx) {
  STATE.orderItems.splice(idx, 1);
  renderOrderItemsUI();
  updateOrderModalTotals();
}

function onOrderFormChanged() {
  updateOrderModalTotals();
  if (!STATE.editingOrderId) {
    try {
      localStorage.setItem("draft_order_android", JSON.stringify({
        customer_name: document.getElementById("om-name").value,
        phone: document.getElementById("om-phone").value,
        address: document.getElementById("om-addr").value,
        messenger: document.getElementById("om-messenger").value,
        order_kind: document.getElementById("om-kind").value,
        delivery_date: document.getElementById("om-deliv").value,
        design_cost: parseNumber(document.getElementById("om-design").value),
        cliche_cost: parseNumber(document.getElementById("om-cliche").value),
        packaging_cost: parseNumber(document.getElementById("om-pack").value),
        discount: parseNumber(document.getElementById("om-disc").value),
        shipping_cost: parseNumber(document.getElementById("om-ship").value),
        deposit_amount: parseNumber(document.getElementById("om-deposit").value),
        notes: document.getElementById("om-notes").value,
        items: STATE.orderItems
      }));
    } catch (e) {}
  }
}

function clearOrderDraftAndReset() {
  localStorage.removeItem("draft_order_android");
  openOrderModal();
  toast("پیش‌نویس پاک شد");
}

function updateOrderModalTotals() {
  const warnings = [];
  let sub = 0, cogs = 0;
  for (const it of STATE.orderItems) {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_price) || 0;
    const c = Number(it.cost_price) || 0;
    it.total = q * p;
    sub += it.total;
    cogs += q * c;
    if (c > 0 && p > 0 && p < c) warnings.push(`فروش زیر قیمت تمام‌شده (${it.title})`);
    if (it.product_id && q > 0) {
      const prod = DB.getProduct(it.product_id);
      if (prod && q > prod.stock_qty) warnings.push(`موجودی «${prod.name}» کم است (${formatQty(prod.stock_qty)})`);
    }
  }
  const design = parseNumber(document.getElementById("om-design")?.value);
  const cliche = parseNumber(document.getElementById("om-cliche")?.value);
  const pack = parseNumber(document.getElementById("om-pack")?.value);
  const disc = parseNumber(document.getElementById("om-disc")?.value);
  const ship = parseNumber(document.getElementById("om-ship")?.value);
  const dep = parseNumber(document.getElementById("om-deposit")?.value);
  const total = Math.max(0, sub + design + cliche + pack - disc + ship);
  const rem = Math.max(0, total - dep);

  if (STATE.orderCreditLimit > 0 && (STATE.orderCustDebt + rem) > STATE.orderCreditLimit) {
    warnings.push(`عبور از سقف اعتبار (${formatMoney(STATE.orderCreditLimit)} ت)`);
  }
  const wb = document.getElementById("om-warn-badge");
  if (wb) {
    wb.style.display = warnings.length ? "block" : "none";
    wb.textContent = "⚠️ " + warnings.slice(0, 2).join(" | ");
  }
  const sm = document.getElementById("om-summary");
  if (sm) {
    sm.innerHTML = `
      <span>نهایی: <b style="color:var(--primary)">${formatMoney(total)} ت</b></span>
      <span>مانده: <b style="color:${rem > 0 ? "var(--danger)" : "var(--success)"}">${rem > 0 ? formatMoney(rem) + " ت" : "تسویه ✅"}</b></span>
      <span>سود تخمینی: ${formatMoney(total - cogs)} ت</span>
    `;
  }
}

function submitOrderForm() {
  const name = document.getElementById("om-name").value.trim();
  if (!name) { toast("لطفاً نام مشتری را وارد کنید", "error"); return; }

  const validItems = STATE.orderItems.filter(it => (Number(it.quantity) || 0) > 0).map(it => ({
    ...it,
    title: (it.title || "").trim() || (it.calc_type === "متری" ? "چاپ متری" : "سفارش عددی"),
    total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
  }));
  const design = parseNumber(document.getElementById("om-design").value);
  const cliche = parseNumber(document.getElementById("om-cliche").value);
  const pack = parseNumber(document.getElementById("om-pack").value);
  const disc = parseNumber(document.getElementById("om-disc").value);
  const ship = parseNumber(document.getElementById("om-ship").value);
  const dep = parseNumber(document.getElementById("om-deposit").value);

  if (!validItems.length && (design + cliche) <= 0) {
    toast("حداقل یک ردیف کالا یا هزینه طراحی وارد کنید", "error");
    return;
  }

  const sub = validItems.reduce((a, b) => a + b.total, 0);
  const cogs = validItems.reduce((a, b) => a + (Number(b.cost_price) || 0) * b.quantity, 0);
  const gross = sub + design + cliche + pack;
  const maxPct = Number(DB.currentUser.max_discount_pct) || 100;
  if (gross > 0 && (disc / gross) * 100 > maxPct) {
    toast(`سقف تخفیف مجاز برای شما ${maxPct}% است`, "error");
    return;
  }

  const total = Math.max(0, gross - disc + ship);
  const wf = document.getElementById("om-wf").value;
  const title = validItems.length === 1 ? validItems[0].title
    : (validItems.length > 1 ? validItems.slice(0, 2).map(x => x.title).join("، ") : "خدمات طراحی و کلیشه");

  const payload = {
    order_date: document.getElementById("om-date").value.trim() || getTodayJalali(),
    delivery_date: document.getElementById("om-deliv").value.trim(),
    customer_name: name,
    phone: document.getElementById("om-phone").value.trim(),
    address: document.getElementById("om-addr").value.trim(),
    messenger: document.getElementById("om-messenger").value,
    order_kind: document.getElementById("om-kind").value,
    workflow_status: wf,
    product_title: title,
    items: validItems,
    design_cost: design, cliche_cost: cliche, packaging_cost: pack,
    discount: disc, shipping_cost: ship,
    total_price: total, total_cost: cogs,
    has_deposit: dep > 0, deposit_amount: dep, remaining_amount: Math.max(0, total - dep),
    stage_design: ["تأیید طرح", "در حال چاپ", "برش و رول‌پیچی", "بسته‌بندی", "ارسال شده", "تحویل شده"].includes(wf) ? 1 : 0,
    stage_print: ["برش و رول‌پیچی", "بسته‌بندی", "ارسال شده", "تحویل شده"].includes(wf) ? 1 : 0,
    stage_ship: ["ارسال شده", "تحویل شده"].includes(wf) ? 1 : 0,
    marketer_name: document.getElementById("om-marketer").value,
    tracking_code: document.getElementById("om-track").value.trim(),
    notes: document.getElementById("om-notes").value.trim()
  };

  const deduct = document.getElementById("om-deduct").checked;
  localStorage.removeItem("draft_order_android");
  if (STATE.editingOrderId) {
    DB.updateOrder(STATE.editingOrderId, payload, deduct);
    toast(`سفارش #${STATE.editingOrderId} ویرایش شد ✅`);
  } else {
    const nid = DB.addOrder(payload, deduct);
    toast(`سفارش #${nid} با موفقیت ثبت شد ✅`);
  }
  closeModal();
  refreshAll();
}

// ============================================================
// ۳. انبارداری تخصصی برچسب حرارتی، ریبون، برش رول مادر و قیمت گروهی
// ============================================================

function renderInventory() {
  const rows = DB.fetchProducts({
    search: document.getElementById("inv-search").value,
    size_filter: document.getElementById("inv-size").value,
    product_type: document.getElementById("inv-type").value || "همه",
    warehouse: document.getElementById("inv-wh").value || "همه",
    low_stock_only: document.getElementById("inv-low-only").checked
  });

  const lowCnt = rows.filter(p => p.stock_qty <= p.min_stock).length;
  document.getElementById("inv-summary").innerHTML = `
    <span>تعداد کالا: ${rows.length} قلم</span>
    <span style="color:${lowCnt ? "var(--danger)" : "var(--success)"}">کم‌موجودی: ${lowCnt} قلم</span>
  `;

  if (!rows.length) {
    document.getElementById("inventory-list").innerHTML = `
      <div class="card empty-state">
        <div style="font-size:32px;margin-bottom:8px;">🏷️</div>
        <div>هنوز کالایی ثبت نشده یا فیلتر نتیجه‌ای ندارد</div>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="openProductModal()">+ تعریف اولین کالا</button>
      </div>`;
    return;
  }

  document.getElementById("inventory-list").innerHTML = rows.map(p => {
    const spec = buildProductSpecText(p);
    const low = p.stock_qty <= p.min_stock;
    return `
      <div class="item-card">
        <div class="item-card-head">
          <div>
            <div class="item-title">${escapeHtml(p.name)}</div>
            <div class="item-meta">کد: <b>${escapeHtml(p.sku)}</b> ${p.barcode ? "• بارکد: " + escapeHtml(p.barcode) : ""} • ${escapeHtml(p.product_type)}</div>
            ${spec ? `<div class="item-meta">${escapeHtml(spec)}</div>` : ""}
            <div class="item-meta">انبار: ${escapeHtml(p.warehouse_name)} ${p.shelf_location ? `(${escapeHtml(p.shelf_location)})` : ""} ${p.batch_lot ? `• بچ: ${escapeHtml(p.batch_lot)}` : ""}</div>
          </div>
          <span class="badge ${low ? "badge-red" : "badge-green"}">${formatQty(p.stock_qty)} ${escapeHtml(p.unit_main)}</span>
        </div>
        <div class="item-money-row">
          <span>خرده: <b>${formatMoney(p.retail_price)}</b></span>
          <span>عمده: <b>${formatMoney(p.wholesale_price)}</b></span>
          <span>همکار: <b>${formatMoney(p.partner_price)}</b></span>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-success" onclick="openStockMoveModal(${p.id})">± رسید / حواله</button>
          <button class="btn btn-sm btn-secondary" onclick="openProductCardModal(${p.id})">📋 کارت کالا</button>
          <button class="btn btn-sm btn-secondary" onclick="openProductModal(${p.id})">✏️ ویرایش</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProductConfirm(${p.id})">🗑️</button>
        </div>
      </div>`;
  }).join("");
}

function openStockPicker(target) {
  if (target === "order") STATE.tempOrderDraft = captureOrderModalSnapshot();
  STATE.stockPickerTarget = target;
  const pg = target === "order" ? STATE.orderPriceGroup : STATE.invPriceGroup;
  const prods = DB.fetchProducts();
  openModal(`📦 انتخاب کالا از انبار (${pg})`, `
    <input type="text" id="sp-search" placeholder="جستجو با نام، کد SKU، بارکد یا سایز..." oninput="filterStockPickerList()" style="margin-bottom:8px;" />
    <div class="field-group"><label>تعداد / مقدار انتخابی</label><input type="number" step="any" id="sp-qty" value="1" /></div>
    <div id="sp-list"></div>
  `, `<button class="btn btn-secondary" onclick="closeStockPicker()">بازگشت</button>`);
  filterStockPickerList();
}

function filterStockPickerList() {
  const q = document.getElementById("sp-search").value;
  const pg = STATE.stockPickerTarget === "order" ? STATE.orderPriceGroup : STATE.invPriceGroup;
  const rows = DB.fetchProducts({ search: q });
  document.getElementById("sp-list").innerHTML = rows.length
    ? rows.map(p => `
        <div class="item-card" onclick="pickStockProduct(${p.id})" style="cursor:pointer;">
          <div class="item-card-head">
            <div><div class="item-title">${escapeHtml(p.name)}</div>
              <div class="item-meta">${escapeHtml(p.sku)} • ${escapeHtml(buildProductSpecText(p) || p.product_type)}</div>
            </div>
            <span class="badge ${p.stock_qty <= p.min_stock ? "badge-red" : "badge-green"}">${formatQty(p.stock_qty)} ${escapeHtml(p.unit_main)}</span>
          </div>
          <div style="font-size:12.5px;font-weight:700;color:var(--primary);">قیمت (${pg}): ${formatMoney(getTieredPrice(p, pg, 1))} تومان</div>
        </div>`).join("")
    : `<div class="empty-state">کالایی یافت نشد</div>`;
}

function pickStockProduct(pid) {
  const prod = DB.getProduct(pid);
  const qty = Math.max(0.01, parseNumber(document.getElementById("sp-qty").value) || 1);
  if (!prod) return;
  if (STATE.stockPickerTarget === "order") {
    addWarehouseProductToOrder(prod, qty);
    if (STATE.tempOrderDraft) {
      STATE.tempOrderDraft.items = STATE.orderItems.map(x => ({ ...x }));
      STATE.tempOrderDraft.stock_deducted = true;
    }
    openOrderModal(STATE.editingOrderId, null, true);
    toast(`${prod.name} به سفارش اضافه شد ✅`);
  } else {
    closeModal();
    addWarehouseProductToInvoice(prod, qty);
    toast(`${prod.name} به فاکتور اضافه شد ✅`);
  }
}

function openProductModal(pid = null) {
  const p = pid ? DB.getProduct(pid) : null;
  const sku = p ? p.sku : DB.nextSku("رول برچسب");
  const optList = (arr, cur) => arr.map(v => `<option value="${escapeHtml(v)}" ${v === cur ? "selected" : ""}>${escapeHtml(v || "— انتخاب —")}</option>`).join("");

  openModal(p ? `ویرایش کالا (${p.sku})` : "تعریف کالای جدید", `
    <div class="grid-2">
      <div class="field-group"><label>نوع محصول *</label><select id="pm-type">${optList(PRODUCT_TYPES, p ? p.product_type : "رول برچسب")}</select></div>
      <div class="field-group"><label>کد کالا (SKU) *</label><input type="text" id="pm-sku" value="${escapeHtml(sku)}" /></div>
    </div>
    <div class="field-group"><label>نام کالا *</label><input type="text" id="pm-name" value="${escapeHtml(p ? p.name : "")}" placeholder="مثلاً: لیبل حرارتی 40×60 تک‌ردیفه" /></div>
    <div class="grid-2">
      <div class="field-group"><label>بارکد</label>
        <div class="row-nowrap">
          <input type="text" id="pm-bar" class="flex-1" value="${escapeHtml(p ? p.barcode : "")}" />
          <button class="btn btn-sm btn-secondary" onclick="scanBarcodeInto('pm-bar')">📷</button>
        </div>
      </div>
      <div class="field-group"><label>برند</label><input type="text" id="pm-brand" value="${escapeHtml(p ? p.brand : "")}" /></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>واحد اصلی</label><input type="text" id="pm-umain" value="${escapeHtml(p ? p.unit_main : "رول")}" /></div>
      <div class="field-group"><label>سایز / ابعاد</label><input type="text" id="pm-size" value="${escapeHtml(p ? p.size_spec : "")}" placeholder="40×60 میلی‌متر" /></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>تعداد ستون</label><select id="pm-cols">${optList(COLUMNS_LIST, p ? p.columns_count : "")}</select></div>
      <div class="field-group"><label>جنس برچسب</label><select id="pm-mat">${optList(MATERIALS, p ? p.material : "")}</select></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>نوع چسب</label><select id="pm-adh">${optList(ADHESIVES, p ? p.adhesive_type : "")}</select></div>
      <div class="field-group"><label>روش چاپ حرارتی</label><select id="pm-method">${optList(PRINT_METHODS, p ? p.print_method : "")}</select></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>قطر هسته (بوبین)</label><select id="pm-core">${optList(CORE_SIZES, p ? p.core_size : "")}</select></div>
      <div class="field-group"><label>تعداد برچسب در رول</label><input type="number" id="pm-lpr" value="${p ? p.labels_per_roll : 0}" /></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>نوع ریبون</label><select id="pm-rtype">${optList(RIBBON_TYPES, p ? p.ribbon_type : "")}</select></div>
      <div class="field-group"><label>جهت وایند ریبون</label><select id="pm-rwind">${optList(RIBBON_WINDS, p ? p.ribbon_wind : "")}</select></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>قیمت تمام‌شده</label><input type="text" inputmode="numeric" id="pm-cost" value="${formatMoney(p ? p.cost_price : 0)}" /></div>
      <div class="field-group"><label>قیمت خرده‌فروشی</label><input type="text" inputmode="numeric" id="pm-retail" value="${formatMoney(p ? p.retail_price : 0)}" /></div>
      <div class="field-group"><label>قیمت عمده‌فروشی</label><input type="text" inputmode="numeric" id="pm-whole" value="${formatMoney(p ? p.wholesale_price : 0)}" /></div>
      <div class="field-group"><label>قیمت همکار</label><input type="text" inputmode="numeric" id="pm-partner" value="${formatMoney(p ? p.partner_price : 0)}" /></div>
      <div class="field-group"><label>پله ۱ (از تعداد)</label><input type="number" id="pm-t1q" value="${p ? p.tier1_min_qty : 11}" /></div>
      <div class="field-group"><label>قیمت پله ۱</label><input type="text" inputmode="numeric" id="pm-t1p" value="${formatMoney(p ? p.tier1_price : 0)}" /></div>
      <div class="field-group"><label>پله ۲ (از تعداد)</label><input type="number" id="pm-t2q" value="${p ? p.tier2_min_qty : 100}" /></div>
      <div class="field-group"><label>قیمت پله ۲</label><input type="text" inputmode="numeric" id="pm-t2p" value="${formatMoney(p ? p.tier2_price : 0)}" /></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>انبار</label><select id="pm-wh">${optList(DB.getWarehouses(), p ? p.warehouse_name : "انبار اصلی")}</select></div>
      <div class="field-group"><label>قفسه / محل</label><input type="text" id="pm-shelf" value="${escapeHtml(p ? p.shelf_location : "")}" /></div>
      <div class="field-group"><label>موجودی اولیه</label><input type="number" step="any" id="pm-stock" value="${p ? p.stock_qty : 0}" ${p ? "disabled" : ""} /></div>
      <div class="field-group"><label>نقطه سفارش (حداقل)</label><input type="number" step="any" id="pm-min" value="${p ? p.min_stock : 5}" /></div>
    </div>
    <div class="field-group"><label>شماره بچ / لات</label><input type="text" id="pm-batch" value="${escapeHtml(p ? p.batch_lot : "")}" /></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitProductForm(${pid || "null"})">💾 ذخیره کالا</button>
  `);
  ["pm-cost", "pm-retail", "pm-whole", "pm-partner", "pm-t1p", "pm-t2p"].forEach(id => attachMoneyFormatting(document.getElementById(id)));
}

function submitProductForm(pid) {
  const name = document.getElementById("pm-name").value.trim();
  const sku = document.getElementById("pm-sku").value.trim();
  if (!name || !sku) { toast("نام کالا و کد SKU الزامی است", "error"); return; }
  const payload = {
    sku, barcode: document.getElementById("pm-bar").value.trim(), name,
    product_type: document.getElementById("pm-type").value,
    brand: document.getElementById("pm-brand").value.trim(),
    unit_main: document.getElementById("pm-umain").value.trim() || "رول",
    size_spec: document.getElementById("pm-size").value.trim(),
    columns_count: document.getElementById("pm-cols").value,
    material: document.getElementById("pm-mat").value,
    adhesive_type: document.getElementById("pm-adh").value,
    print_method: document.getElementById("pm-method").value,
    core_size: document.getElementById("pm-core").value,
    labels_per_roll: parseNumber(document.getElementById("pm-lpr").value),
    ribbon_type: document.getElementById("pm-rtype").value,
    ribbon_wind: document.getElementById("pm-rwind").value,
    cost_price: parseNumber(document.getElementById("pm-cost").value),
    retail_price: parseNumber(document.getElementById("pm-retail").value),
    wholesale_price: parseNumber(document.getElementById("pm-whole").value),
    partner_price: parseNumber(document.getElementById("pm-partner").value),
    tier1_min_qty: parseNumber(document.getElementById("pm-t1q").value),
    tier1_price: parseNumber(document.getElementById("pm-t1p").value),
    tier2_min_qty: parseNumber(document.getElementById("pm-t2q").value),
    tier2_price: parseNumber(document.getElementById("pm-t2p").value),
    warehouse_name: document.getElementById("pm-wh").value || "انبار اصلی",
    shelf_location: document.getElementById("pm-shelf").value.trim(),
    stock_qty: parseNumber(document.getElementById("pm-stock").value),
    min_stock: parseNumber(document.getElementById("pm-min").value),
    batch_lot: document.getElementById("pm-batch").value.trim()
  };
  try {
    if (pid) DB.updateProduct(pid, payload);
    else DB.addProduct(payload);
    closeModal();
    refreshAll();
    toast("کالا ذخیره شد ✅");
  } catch (e) { toast(e.message, "error"); }
}

function deleteProductConfirm(pid) {
  if (confirm("آیا این کالا از انبار حذف شود؟")) {
    DB.deleteProduct(pid);
    refreshAll();
    toast("کالا حذف شد", "warning");
  }
}

function openStockMoveModal(pid) {
  const p = DB.getProduct(pid);
  if (!p) return;
  openModal(`سند انبار — ${p.name}`, `
    <div class="alert-box alert-success">موجودی فعلی: ${formatQty(p.stock_qty)} ${escapeHtml(p.unit_main)} | انبار: ${escapeHtml(p.warehouse_name)}</div>
    <div class="field-group"><label>نوع سند انبار</label>
      <select id="sm-type">
        <option value="1|رسید ورود (خرید)">رسید ورود (خرید)</option>
        <option value="1|رسید تولید">رسید تولید</option>
        <option value="1|رسید مرجوعی فروش">رسید مرجوعی فروش</option>
        <option value="-1|حواله خروج (فروش)">حواله خروج (فروش)</option>
        <option value="-1|حواله مصرف / تولید">حواله مصرف / تولید</option>
        <option value="-1|حواله ضایعات">حواله ضایعات</option>
        <option value="99|تعدیل انبارگردانی">انبارگردانی (تنظیم موجودی دقیق)</option>
      </select>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>مقدار (${escapeHtml(p.unit_main)})</label><input type="number" step="any" id="sm-qty" value="1" /></div>
      <div class="field-group"><label>فی خرید / بهای واحد</label><input type="text" inputmode="numeric" id="sm-cost" value="${formatMoney(p.cost_price)}" /></div>
    </div>
    <div class="field-group"><label>توضیحات</label><input type="text" id="sm-notes" placeholder="شماره فاکتور یا توضیح..." /></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitStockMove(${pid})">ثبت سند انبار</button>
  `);
  attachMoneyFormatting(document.getElementById("sm-cost"));
}

function submitStockMove(pid) {
  const p = DB.getProduct(pid);
  const [signStr, label] = document.getElementById("sm-type").value.split("|");
  const sign = Number(signStr);
  const qty = parseNumber(document.getElementById("sm-qty").value);
  const cost = parseNumber(document.getElementById("sm-cost").value);
  const notes = document.getElementById("sm-notes").value.trim();
  if (sign === 99) {
    DB.recordStockMovement(pid, label, qty - p.stock_qty, { unitCost: cost, notes: `انبارگردانی به ${qty} | ${notes}` });
  } else {
    if (qty <= 0) { toast("مقدار باید بیشتر از صفر باشد", "error"); return; }
    DB.recordStockMovement(pid, label, qty * sign, { unitCost: cost, wasteQty: label.includes("ضایعات") ? qty : 0, notes });
  }
  closeModal();
  refreshAll();
  toast("سند انبار ثبت شد ✅");
}

function openProductCardModal(pid) {
  const p = DB.getProduct(pid);
  const rows = DB.getProductCard(pid);
  openModal(`📋 کارت کالا — ${p.name}`, rows.length
    ? rows.map(r => `
        <div class="item-card">
          <div class="item-card-head">
            <b>${escapeHtml(r.move_type)}</b>
            <span class="badge ${r.qty_change >= 0 ? "badge-green" : "badge-red"}">${r.qty_change > 0 ? "+" : ""}${formatQty(r.qty_change)}</span>
          </div>
          <div class="item-meta">${escapeHtml(r.move_date)} • فی: ${formatMoney(r.unit_cost)} ت ${r.notes ? "• " + escapeHtml(r.notes) : ""}</div>
        </div>`).join("")
    : `<div class="empty-state">گردشی ثبت نشده است</div>`,
    `<button class="btn btn-primary" onclick="closeModal()">بستن</button>`);
}

function openSlittingModal() {
  const prods = DB.fetchProducts();
  if (prods.length < 2) { toast("برای برش رول مادر حداقل ۲ کالا تعریف کنید", "warning"); return; }
  const opts = prods.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${formatQty(p.stock_qty)} ${p.unit_main})</option>`).join("");
  openModal("✂️ برش رول مادر (Jumbo Slitting)", `
    <div class="field-group"><label>رول مادر / ماده اولیه</label><select id="sl-jumbo">${opts}</select></div>
    <div class="grid-2">
      <div class="field-group"><label>مصرف خالص</label><input type="number" step="any" id="sl-cons" value="1" /></div>
      <div class="field-group"><label>ضایعات برش</label><input type="number" step="any" id="sl-waste" value="0" /></div>
    </div>
    <div class="field-group"><label>کالای خروجی (رول برچسب آماده)</label><select id="sl-out">${opts}</select></div>
    <div class="grid-2">
      <div class="field-group"><label>تعداد رول تولیدشده</label><input type="number" step="any" id="sl-prod" value="10" /></div>
      <div class="field-group"><label>شماره بچ/لات</label><input type="text" id="sl-batch" value="LOT-${getTodayJalali().replace(/\//g, "")}" /></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitSlitting()">ثبت برش و به‌روزرسانی انبار</button>
  `);
}

function submitSlitting() {
  const jid = Number(document.getElementById("sl-jumbo").value);
  const oid = Number(document.getElementById("sl-out").value);
  const cons = parseNumber(document.getElementById("sl-cons").value);
  const waste = parseNumber(document.getElementById("sl-waste").value);
  const prod = parseNumber(document.getElementById("sl-prod").value);
  if (jid === oid || cons <= 0 || prod <= 0) { toast("دو کالای متفاوت و مقادیر > 0 وارد کنید", "error"); return; }
  DB.performJumboSlitting(jid, cons, waste, oid, prod, document.getElementById("sl-batch").value.trim());
  closeModal();
  refreshAll();
  toast("عملیات برش رول مادر ثبت شد ✅");
}

function openBulkPriceModal() {
  openModal("📈 آپدیت دسته‌جمعی قیمت‌ها", `
    <div class="grid-2">
      <div class="field-group"><label>نوع محصول</label><select id="bp-type"><option value="همه">همه</option>${PRODUCT_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select></div>
      <div class="field-group"><label>روش تغییر</label><select id="bp-mode"><option value="percent">درصدی (%)</option><option value="amount">مبلغ ثابت (تومان)</option></select></div>
    </div>
    <div class="field-group"><label>مقدار تغییر (مثلاً 15 یا -10)</label><input type="number" step="any" id="bp-val" value="10" /></div>
    <div class="field-group"><label>علت تغییر</label><input type="text" id="bp-reason" value="تعدیل نرخ مواد اولیه / ارز" /></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitBulkPrice()">اعمال روی قیمت‌ها</button>
  `);
}

function submitBulkPrice() {
  const val = parseNumber(document.getElementById("bp-val").value);
  if (!val) { toast("مقدار تغییر نمی‌تواند صفر باشد", "error"); return; }
  const cnt = DB.bulkUpdatePrices({
    product_type: document.getElementById("bp-type").value,
    mode: document.getElementById("bp-mode").value,
    value: val,
    targetFields: ["retail_price", "wholesale_price", "partner_price", "tier1_price", "tier2_price"],
    reason: document.getElementById("bp-reason").value.trim()
  });
  closeModal();
  refreshAll();
  toast(`قیمت ${cnt} کالا به‌روزرسانی شد ✅`);
}

// ============================================================
// ۴. استودیو فاکتور (پیش‌نمایش زنده A4 + چاپ/PDF + اشتراک + آرشیو)
// ============================================================

function refreshInvoiceDropdowns() {
  const archSel = document.getElementById("inv-archive-select");
  const invs = DB.fetchInvoices();
  archSel.innerHTML = invs.length
    ? invs.map(i => `<option value="${i.id}">${escapeHtml(i.invoice_number)} | ${escapeHtml(i.invoice_type)} | ${escapeHtml(i.customer_name)} (${formatMoney(i.grand_total)})${i.status === "ابطال‌شده" ? " [ابطال]" : ""}</option>`).join("")
    : `<option value="">آرشیو خالی است</option>`;

  const custSel = document.getElementById("inv-cust-pick");
  const custs = DB.getAllCustomersDirectory();
  custSel.innerHTML = `<option value="">— انتخاب مشتری قبلی —</option>` + custs.map(c =>
    `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} ${c.phone ? "| " + escapeHtml(c.phone) : ""}</option>`
  ).join("");
}

function onInvTypeChange() {
  document.getElementById("inv-num").value = DB.nextInvoiceNumber(document.getElementById("inv-doc-type").value);
  onInvEdited();
}

function onInvCustPicked() {
  const name = document.getElementById("inv-cust-pick").value;
  if (!name) return;
  const cust = DB.getAllCustomersDirectory().find(c => c.name === name);
  if (!cust) return;
  STATE.invPriceGroup = cust.price_group || "خرده‌فروشی";
  STATE.invCreditLimit = Number(cust.credit_limit) || 0;
  STATE.invCustDebt = DB.getCustomerDebt(cust.name);
  document.getElementById("inv-cust-name").value = cust.name;
  document.getElementById("inv-cust-phone").value = cust.phone || "";
  document.getElementById("inv-cust-econ").value = cust.economic_code || cust.national_id || "";
  document.getElementById("inv-cust-addr").value = cust.address || "";
  const b = document.getElementById("inv-live-banner");
  b.textContent = `👤 ${cust.name} (${STATE.invPriceGroup}) | مانده قبلی: ${formatMoney(STATE.invCustDebt)} ت`;
  b.style.display = "block";
  onInvEdited();
}

function resetInvoiceForm(silent = false) {
  localStorage.removeItem("draft_invoice_android");
  const s = DB.getSettings();
  STATE.invOrderId = null;
  STATE.invStatus = "فعال";
  STATE.invAccent = s.invoice_accent || "#2F6F5E";
  STATE.invPriceGroup = "خرده‌فروشی";
  STATE.invCreditLimit = 0;
  STATE.invCustDebt = 0;
  document.getElementById("inv-doc-type").value = "فاکتور فروش";
  document.getElementById("inv-num").value = DB.nextInvoiceNumber("فاکتور فروش");
  document.getElementById("inv-date").value = getTodayJalali();
  document.getElementById("inv-cust-name").value = "";
  document.getElementById("inv-cust-phone").value = "";
  document.getElementById("inv-cust-econ").value = "";
  document.getElementById("inv-cust-addr").value = "";
  document.getElementById("inv-pay-terms").value = "نقدی / کارت‌به‌کارت";
  document.getElementById("inv-discount").value = "0";
  document.getElementById("inv-shipping").value = "0";
  document.getElementById("inv-tax").value = "0";
  document.getElementById("inv-paid").value = "0";
  document.getElementById("inv-notes").value = s.invoice_footer || "";
  document.getElementById("inv-live-banner").style.display = "none";
  STATE.invItems = [{ product_id: null, title: "رول برچسب حرارتی اختصاصی", unit: "رول", qty: 1, unit_price: 0, total: 0 }];
  renderInvItemsUI();
  renderInvoicePreview();
  if (!silent) toast("فرم فاکتور جدید آماده شد");
}

function cloneInvoice() {
  STATE.invOrderId = null;
  STATE.invStatus = "فعال";
  document.getElementById("inv-num").value = DB.nextInvoiceNumber(document.getElementById("inv-doc-type").value);
  document.getElementById("inv-date").value = getTodayJalali();
  document.getElementById("inv-paid").value = "0";
  onInvEdited();
  toast("کپی فاکتور با شماره جدید ساخته شد ✅");
}

function loadOrderIntoInvoice(oid) {
  const o = DB.getOrder(oid);
  if (!o) return;
  const s = DB.getSettings();
  const party = DB.getPartyByName(o.customer_name);
  STATE.invOrderId = o.id;
  STATE.invStatus = "فعال";
  STATE.invAccent = s.invoice_accent || "#2F6F5E";
  document.getElementById("inv-doc-type").value = o.workflow_status === "پیش‌نویس" ? "پیش‌فاکتور" : "فاکتور فروش";
  document.getElementById("inv-num").value = DB.nextInvoiceNumber(document.getElementById("inv-doc-type").value);
  document.getElementById("inv-date").value = getTodayJalali();
  document.getElementById("inv-cust-name").value = o.customer_name;
  document.getElementById("inv-cust-phone").value = o.phone || "";
  document.getElementById("inv-cust-econ").value = party ? (party.economic_code || party.national_id || "") : "";
  document.getElementById("inv-cust-addr").value = o.address || `ثبت از ${o.messenger}`;
  document.getElementById("inv-discount").value = formatMoney(o.discount);
  document.getElementById("inv-shipping").value = formatMoney(o.shipping_cost);
  document.getElementById("inv-tax").value = "0";
  document.getElementById("inv-paid").value = formatMoney(o.deposit_amount);
  document.getElementById("inv-notes").value = o.notes || s.invoice_footer || "";

  STATE.invItems = (o.items || []).map(it => ({
    product_id: it.product_id || null,
    title: it.spec ? `${it.title} (${it.spec})` : it.title,
    unit: it.unit || "عدد", qty: it.quantity, unit_price: it.unit_price, total: it.total
  }));
  if (o.design_cost > 0) STATE.invItems.push({ product_id: null, title: "هزینه طراحی اختصاصی", unit: "خدمت", qty: 1, unit_price: o.design_cost, total: o.design_cost });
  if (o.cliche_cost > 0) STATE.invItems.push({ product_id: null, title: "هزینه ساخت کلیشه", unit: "خدمت", qty: 1, unit_price: o.cliche_cost, total: o.cliche_cost });
  if (o.packaging_cost > 0) STATE.invItems.push({ product_id: null, title: "هزینه بسته‌بندی", unit: "خدمت", qty: 1, unit_price: o.packaging_cost, total: o.packaging_cost });
  renderInvItemsUI();
  renderInvoicePreview();
}

function addInvItem(title = "", unit = "رول", qty = 1, price = 0, pid = null) {
  STATE.invItems.push({ product_id: pid, title, unit, qty, unit_price: price, total: qty * price });
  renderInvItemsUI();
  onInvEdited();
}

function addWarehouseProductToInvoice(p, qty) {
  const spec = buildProductSpecText(p);
  const title = spec ? `${p.name} (${spec})` : p.name;
  const price = getTieredPrice(p, STATE.invPriceGroup, qty);
  addInvItem(title, p.unit_main || "رول", qty, price, p.id);
}

function renderInvItemsUI() {
  document.getElementById("inv-items-container").innerHTML = STATE.invItems.map((it, i) => `
    <div class="line-item-box">
      <div class="row-nowrap" style="margin-bottom:6px;">
        <input type="text" class="flex-1" value="${escapeHtml(it.title)}" placeholder="شرح کالا" oninput="updInvItem(${i},'title',this.value)" />
        <button class="btn btn-sm btn-danger" onclick="delInvItem(${i})">✕</button>
      </div>
      <div class="grid-3">
        <input type="text" value="${escapeHtml(it.unit)}" placeholder="واحد" oninput="updInvItem(${i},'unit',this.value)" />
        <input type="number" step="any" value="${it.qty}" placeholder="مقدار" oninput="updInvItem(${i},'qty',this.value)" />
        <input type="text" inputmode="numeric" value="${formatMoney(it.unit_price)}" placeholder="فی" oninput="updInvItem(${i},'unit_price',this.value)" />
      </div>
    </div>
  `).join("");
}

function updInvItem(i, f, v) {
  const it = STATE.invItems[i];
  if (!it) return;
  if (f === "qty" || f === "unit_price") it[f] = parseNumber(v);
  else it[f] = v;
  it.total = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
  onInvEdited();
}

function delInvItem(i) {
  STATE.invItems.splice(i, 1);
  renderInvItemsUI();
  onInvEdited();
}

function setInvAccent(hex) {
  STATE.invAccent = hex;
  onInvEdited();
}

function collectInvoiceData() {
  const warnings = [];
  let subtotal = 0;
  const items = STATE.invItems.map(it => {
    const rt = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    subtotal += rt;
    if (it.product_id && it.qty > 0) {
      const p = DB.getProduct(it.product_id);
      if (p && it.qty > p.stock_qty) warnings.push(`موجودی ناکافی «${p.name}» (${formatQty(p.stock_qty)})`);
    }
    return { ...it, total: rt };
  });
  const discount = parseNumber(document.getElementById("inv-discount").value);
  const shipping_cost = parseNumber(document.getElementById("inv-shipping").value);
  const tax_percent = parseNumber(document.getElementById("inv-tax").value);
  const taxable = Math.max(0, subtotal - discount);
  const tax_amount = taxable * (tax_percent / 100);
  const grand_total = Math.max(0, taxable + tax_amount + shipping_cost);
  const paid_amount = parseNumber(document.getElementById("inv-paid").value);
  const remaining_amount = Math.max(0, grand_total - paid_amount);

  if (STATE.invCreditLimit > 0 && (STATE.invCustDebt + remaining_amount) > STATE.invCreditLimit) {
    warnings.push(`عبور از سقف اعتبار (${formatMoney(STATE.invCreditLimit)} ت)`);
  }
  const wb = document.getElementById("inv-warn-banner");
  wb.style.display = warnings.length ? "block" : "none";
  wb.textContent = "⚠️ " + warnings.join(" | ");

  return {
    invoice_number: document.getElementById("inv-num").value.trim() || DB.nextInvoiceNumber(),
    invoice_type: document.getElementById("inv-doc-type").value,
    status: STATE.invStatus,
    order_id: STATE.invOrderId,
    invoice_date: document.getElementById("inv-date").value.trim() || getTodayJalali(),
    customer_name: document.getElementById("inv-cust-name").value.trim() || "مشتری گرامی",
    customer_phone: document.getElementById("inv-cust-phone").value.trim(),
    customer_economic_code: document.getElementById("inv-cust-econ").value.trim(),
    customer_address: document.getElementById("inv-cust-addr").value.trim(),
    payment_terms: document.getElementById("inv-pay-terms").value.trim(),
    items, subtotal, discount, shipping_cost, tax_percent, tax_amount,
    grand_total, paid_amount, remaining_amount,
    accent_color: STATE.invAccent,
    notes: document.getElementById("inv-notes").value.trim()
  };
}

function buildInvoiceHtml() {
  const d = collectInvoiceData();
  const s = DB.getSettings();
  const accent = d.status === "ابطال‌شده" ? "#BE123C" : d.accent_color;
  const showLogo = document.getElementById("inv-opt-logo").checked && s.logo_base64;
  const showCard = document.getElementById("inv-opt-card").checked && s.bank_card;
  const showWords = document.getElementById("inv-opt-words").checked;
  const showSign = document.getElementById("inv-opt-sign").checked;

  const rowsHtml = d.items.map((it, idx) => `
    <tr style="background:${idx % 2 === 0 ? "#fff" : "#F8FAFC"};">
      <td style="text-align:center;padding:6px;border-bottom:1px solid #E2E8F0;">${idx + 1}</td>
      <td style="text-align:right;padding:6px;border-bottom:1px solid #E2E8F0;font-weight:bold;">${escapeHtml(it.title)}</td>
      <td style="text-align:center;padding:6px;border-bottom:1px solid #E2E8F0;">${formatQty(it.qty)} ${escapeHtml(it.unit)}</td>
      <td style="text-align:center;padding:6px;border-bottom:1px solid #E2E8F0;">${formatMoney(it.unit_price)}</td>
      <td style="text-align:center;padding:6px;border-bottom:1px solid #E2E8F0;font-weight:bold;">${formatMoney(it.total)}</td>
    </tr>`).join("");

  return `
  <div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;color:#1E293B;font-size:12px;line-height:1.6;">
    ${d.status === "ابطال‌شده" ? `<div style="background:#FEF2F2;color:#BE123C;border:1px solid #FECDD3;padding:6px;text-align:center;font-weight:bold;margin-bottom:8px;">⚠️ این سند ابطال شده است</div>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${accent};padding-bottom:10px;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${showLogo ? `<img src="${s.logo_base64}" style="width:58px;height:58px;object-fit:contain;" />` : ""}
        <div>
          <div style="font-size:16px;font-weight:900;color:${accent};">${escapeHtml(s.brand_name)}</div>
          <div style="font-size:11px;color:#64748B;">${escapeHtml(s.brand_slogan)}</div>
          <div style="font-size:10.5px;color:#475569;">تلفن: ${escapeHtml(s.brand_phone)} • ${escapeHtml(s.brand_social)} • ${escapeHtml(s.brand_address)}</div>
        </div>
      </div>
      <div style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;min-width:155px;">
        <div style="background:${accent};color:#fff;text-align:center;font-weight:bold;padding:4px 8px;">${escapeHtml(d.invoice_type)}</div>
        <div style="padding:5px 8px;font-size:11px;"><b>شماره:</b> ${escapeHtml(d.invoice_number)}<br/><b>تاریخ:</b> ${escapeHtml(d.invoice_date)}</div>
      </div>
    </div>

    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:11.5px;">
      <b>طرف حساب:</b> ${escapeHtml(d.customer_name)} &nbsp;|&nbsp; <b>تلفن:</b> ${escapeHtml(d.customer_phone || "-")} &nbsp;|&nbsp; <b>کد اقتصادی/ملی:</b> ${escapeHtml(d.customer_economic_code || "-")}<br/>
      <b>نشانی:</b> ${escapeHtml(d.customer_address || "-")}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-top:10px;border:1px solid #E2E8F0;font-size:11.5px;">
      <thead>
        <tr style="background:${accent};color:#fff;">
          <th style="padding:6px;">#</th><th style="padding:6px;text-align:right;">شرح کالا / مشخصات</th>
          <th style="padding:6px;">مقدار</th><th style="padding:6px;">فی</th><th style="padding:6px;">مبلغ کل</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div style="margin-top:10px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;max-width:300px;margin-right:auto;">
      <div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #F1F5F9;"><span>جمع اقلام:</span><b>${formatMoney(d.subtotal)} ت</b></div>
      ${d.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 10px;color:#15803D;"><span>تخفیف:</span><b>- ${formatMoney(d.discount)} ت</b></div>` : ""}
      ${d.tax_amount > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 10px;"><span>ارزش افزوده (${d.tax_percent}%):</span><b>${formatMoney(d.tax_amount)} ت</b></div>` : ""}
      ${d.shipping_cost > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 10px;"><span>ارسال:</span><b>${formatMoney(d.shipping_cost)} ت</b></div>` : ""}
      <div style="display:flex;justify-content:space-between;padding:7px 10px;background:${accent};color:#fff;font-weight:900;"><span>قابل پرداخت:</span><span>${formatMoney(d.grand_total)} تومان</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 10px;color:#15803D;"><span>پرداختی/بیعانه:</span><b>${formatMoney(d.paid_amount)} ت</b></div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:#F8FAFC;font-weight:bold;color:${d.remaining_amount > 0 ? "#BE123C" : "#15803D"};"><span>مانده حساب:</span><span>${d.remaining_amount > 0 ? formatMoney(d.remaining_amount) + " تومان" : "تسویه کامل ✅"}</span></div>
    </div>

    ${showWords ? `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:6px 10px;margin-top:8px;font-size:11px;"><b>مبلغ به حروف:</b> <span style="color:${accent};font-weight:bold;">${numberToPersianWords(d.grand_total)}</span></div>` : ""}
    ${showCard ? `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:6px 10px;margin-top:6px;font-size:11px;"><b>واریز:</b> کارت <b>${escapeHtml(s.bank_card)}</b> به نام <b>${escapeHtml(s.bank_owner)}</b> | ${escapeHtml(d.payment_terms)}</div>` : ""}
    ${d.notes ? `<p style="font-size:11px;color:#475569;margin-top:6px;"><b>توضیحات:</b> ${escapeHtml(d.notes)}</p>` : ""}
    ${showSign ? `<div style="display:flex;justify-content:space-around;margin-top:18px;padding-top:10px;border-top:1px dashed #CBD5E1;color:#64748B;font-size:11px;"><span>مهر و امضای فروشنده</span><span>امضای خریدار</span></div>` : ""}
  </div>`;
}

function renderInvoicePreview() {
  document.getElementById("inv-preview").innerHTML = buildInvoiceHtml();
}

function onInvEdited() {
  renderInvoicePreview();
  try { localStorage.setItem("draft_invoice_android", JSON.stringify(collectInvoiceData())); } catch (e) {}
}

function restoreInvoiceDraft() {
  try {
    const d = JSON.parse(localStorage.getItem("draft_invoice_android") || "null");
    if (!d) return false;
    STATE.invOrderId = d.order_id || null;
    STATE.invStatus = d.status || "فعال";
    STATE.invAccent = d.accent_color || "#2F6F5E";
    document.getElementById("inv-doc-type").value = d.invoice_type || "فاکتور فروش";
    document.getElementById("inv-num").value = d.invoice_number || DB.nextInvoiceNumber();
    document.getElementById("inv-date").value = d.invoice_date || getTodayJalali();
    document.getElementById("inv-cust-name").value = d.customer_name === "مشتری گرامی" ? "" : (d.customer_name || "");
    document.getElementById("inv-cust-phone").value = d.customer_phone || "";
    document.getElementById("inv-cust-econ").value = d.customer_economic_code || "";
    document.getElementById("inv-cust-addr").value = d.customer_address || "";
    document.getElementById("inv-pay-terms").value = d.payment_terms || "نقدی / کارت‌به‌کارت";
    document.getElementById("inv-discount").value = formatMoney(d.discount);
    document.getElementById("inv-shipping").value = formatMoney(d.shipping_cost);
    document.getElementById("inv-tax").value = d.tax_percent || 0;
    document.getElementById("inv-paid").value = formatMoney(d.paid_amount);
    document.getElementById("inv-notes").value = d.notes || "";
    STATE.invItems = d.items && d.items.length ? d.items : [];
    renderInvItemsUI();
    renderInvoicePreview();
    return true;
  } catch (e) { return false; }
}

function saveInvoice(silent = false) {
  const d = collectInvoiceData();
  DB.saveInvoice(d);
  localStorage.removeItem("draft_invoice_android");
  refreshAll();
  if (!silent) toast(`سند ${d.invoice_number} در آرشیو ذخیره شد ✅`);
}

function saveAndPrintInvoice() {
  saveInvoice(true);
  const d = collectInvoiceData();
  nativePrintHtml(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/></head><body style="padding:14px;">${buildInvoiceHtml()}</body></html>`, d.invoice_number);
}

function shareInvoiceText() {
  const d = collectInvoiceData();
  const s = DB.getSettings();
  const lines = [
    `✨ ${s.brand_name}`,
    `🧾 ${d.invoice_type} شماره ${d.invoice_number} | تاریخ: ${d.invoice_date}`,
    `👤 ${d.customer_name}`,
    "━━━━━━━━━━━━━━",
    ...d.items.map((it, i) => `${i + 1}. ${it.title} (${formatQty(it.qty)} ${it.unit}) ⇐ ${formatMoney(it.total)} ت`),
    "━━━━━━━━━━━━━━",
    `💰 جمع نهایی: ${formatMoney(d.grand_total)} تومان (${numberToPersianWords(d.grand_total)})`,
    `💳 پرداختی: ${formatMoney(d.paid_amount)} ت`,
    `📌 مانده: ${d.remaining_amount <= 0 ? "تسویه کامل ✅" : formatMoney(d.remaining_amount) + " تومان"}`
  ];
  if (d.remaining_amount > 0 && s.bank_card) lines.push(`🏦 کارت: ${s.bank_card} (${s.bank_owner})`);
  nativeShareText(lines.join("\n"));
}

function syncInvoiceStock() {
  const d = collectInvoiceData();
  if (d.invoice_type === "پیش‌فاکتور") { toast("پیش‌فاکتور روی انبار اثر ندارد", "warning"); return; }
  const sign = ["فاکتور فروش", "برگشت از خرید"].includes(d.invoice_type) ? -1 : 1;
  let cnt = 0;
  for (const it of d.items) {
    if (it.product_id && it.qty > 0) {
      DB.recordStockMovement(it.product_id, `سند از ${d.invoice_type}`, it.qty * sign, {
        unitCost: d.invoice_type === "فاکتور خرید" ? it.unit_price : 0,
        notes: `${d.invoice_type} ${d.invoice_number} — ${d.customer_name}`
      });
      cnt++;
    }
  }
  refreshAll();
  toast(cnt ? `موجودی انبار برای ${cnt} کالا به‌روز شد ✅` : "کالایی از انبار در این فاکتور نبود", cnt ? "success" : "warning");
}

function loadArchiveInvoice() {
  const id = Number(document.getElementById("inv-archive-select").value);
  const inv = DB.getInvoice(id);
  if (!inv) return;
  STATE.invOrderId = inv.order_id;
  STATE.invStatus = inv.status || "فعال";
  STATE.invAccent = inv.accent_color || "#2F6F5E";
  document.getElementById("inv-doc-type").value = inv.invoice_type;
  document.getElementById("inv-num").value = inv.invoice_number;
  document.getElementById("inv-date").value = inv.invoice_date;
  document.getElementById("inv-cust-name").value = inv.customer_name;
  document.getElementById("inv-cust-phone").value = inv.customer_phone || "";
  document.getElementById("inv-cust-econ").value = inv.customer_economic_code || "";
  document.getElementById("inv-cust-addr").value = inv.customer_address || "";
  document.getElementById("inv-pay-terms").value = inv.payment_terms || "";
  document.getElementById("inv-discount").value = formatMoney(inv.discount);
  document.getElementById("inv-shipping").value = formatMoney(inv.shipping_cost);
  document.getElementById("inv-tax").value = inv.tax_percent || 0;
  document.getElementById("inv-paid").value = formatMoney(inv.paid_amount);
  document.getElementById("inv-notes").value = inv.notes || "";
  STATE.invItems = (inv.items || []).map(x => ({ ...x }));
  renderInvItemsUI();
  renderInvoicePreview();
  toast(`فاکتور ${inv.invoice_number} باز شد`);
}

function cancelArchiveInvoice() {
  const id = Number(document.getElementById("inv-archive-select").value);
  if (!id) return;
  if (confirm("این فاکتور با حفظ سابقه ابطال شود؟")) {
    DB.cancelInvoice(id);
    refreshAll();
    loadArchiveInvoice();
    toast("فاکتور ابطال شد", "warning");
  }
}

function deleteArchiveInvoice() {
  const id = Number(document.getElementById("inv-archive-select").value);
  if (!id) return;
  if (confirm("این فاکتور به‌طور کامل حذف شود؟")) {
    DB.deleteInvoice(id);
    refreshAll();
    toast("فاکتور حذف شد", "warning");
  }
}

// ============================================================
// ۵. مالی، دریافت/پرداخت، چک صیادی و صورت‌حساب معین
// ============================================================

function switchFinTab(tab) {
  STATE.finTab = tab;
  document.querySelectorAll("[data-fintab]").forEach(b => b.classList.toggle("active", b.dataset.fintab === tab));
  ["payments", "checks", "statement"].forEach(t => document.getElementById(`fin-tab-${t}`).style.display = t === tab ? "block" : "none");
  renderFinance();
}

function renderFinance() {
  const pays = DB.fetchPayments(document.getElementById("pay-dir-filter").value, document.getElementById("pay-search").value);
  document.getElementById("payments-list").innerHTML = pays.length
    ? pays.map(p => `
        <div class="item-card">
          <div class="item-card-head">
            <div><div class="item-title">${escapeHtml(p.party_name)}</div>
              <div class="item-meta">${escapeHtml(p.pay_date)} • ${escapeHtml(p.method)} ${p.order_id ? "• سفارش #" + p.order_id : ""}</div>
              ${p.ref_code || p.notes ? `<div class="item-meta">${escapeHtml(p.ref_code)} ${escapeHtml(p.notes)}</div>` : ""}
            </div>
            <span class="badge ${p.direction === "دریافت" ? "badge-green" : "badge-red"}">${p.direction} ${formatMoney(p.amount)} ت</span>
          </div>
          <div class="item-actions"><button class="btn btn-sm btn-danger" onclick="if(confirm('حذف شود؟')){DB.deletePayment(${p.id});refreshAll();}">حذف</button></div>
        </div>`).join("")
    : `<div class="card empty-state">سند مالی ثبت نشده است</div>`;

  const chks = DB.fetchChecks(
    document.getElementById("chk-status-filter").value,
    document.getElementById("chk-dir-filter").value,
    document.getElementById("chk-search").value
  );
  document.getElementById("checks-list").innerHTML = chks.length
    ? chks.map(c => `
        <div class="item-card">
          <div class="item-card-head">
            <div><div class="item-title">${escapeHtml(c.party_name)} (${c.direction})</div>
              <div class="item-meta">چک ${escapeHtml(c.check_number)} • بانک ${escapeHtml(c.bank_name || "-")} ${c.sayadi_id ? "• صیادی: " + escapeHtml(c.sayadi_id) : ""}</div>
              <div class="item-meta">سررسید: <b>${escapeHtml(c.due_date)}</b> • مبلغ: <b>${formatMoney(c.amount)} تومان</b></div>
            </div>
            <span class="badge ${c.status === "وصول شده" ? "badge-green" : (c.status === "برگشتی" ? "badge-red" : "badge-amber")}">${c.status}</span>
          </div>
          <div class="row-nowrap" style="margin-top:8px;">
            <select class="flex-1" style="min-height:36px;" onchange="DB.updateCheckStatus(${c.id},this.value);refreshAll();toast('وضعیت چک به‌روز شد');">
              ${CHECK_STATUSES.map(st => `<option value="${st}" ${st === c.status ? "selected" : ""}>${st}</option>`).join("")}
            </select>
            <button class="btn btn-sm btn-danger" onclick="if(confirm('حذف چک؟')){DB.deleteCheck(${c.id});refreshAll();}">🗑️</button>
          </div>
        </div>`).join("")
    : `<div class="card empty-state">چکی ثبت نشده است</div>`;

  const stmtSel = document.getElementById("stmt-party-select");
  const prev = stmtSel.value;
  const names = [...new Set(DB.getAllCustomersDirectory().map(c => c.name))].sort();
  stmtSel.innerHTML = names.length ? names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("") : `<option value="">مشتری ثبت نشده</option>`;
  if (prev && names.includes(prev)) stmtSel.value = prev;
  if (STATE.finTab === "statement") renderStatement();
}

function renderStatement() {
  const name = document.getElementById("stmt-party-select").value;
  if (!name) { document.getElementById("statement-list").innerHTML = ""; return; }
  const rows = DB.getPartyStatement(name);
  const finalBal = rows.length ? rows[rows.length - 1].balance : 0;
  const st = finalBal > 0 ? "بدهکار" : (finalBal < 0 ? "بستانکار" : "تسویه");
  document.getElementById("stmt-balance").textContent = `مانده نهایی ${name}: ${formatMoney(Math.abs(finalBal))} تومان (${st})`;
  document.getElementById("statement-list").innerHTML = rows.map(r => `
    <div class="item-card">
      <div class="item-card-head">
        <div><div class="item-title" style="font-size:13px;">${escapeHtml(r.desc)}</div><div class="item-meta">${escapeHtml(r.date)}</div></div>
        <span class="badge ${r.credit > 0 ? "badge-green" : "badge-red"}">${r.credit > 0 ? "بستانکار " + formatMoney(r.credit) : "بدهکار " + formatMoney(r.debit)}</span>
      </div>
      <div class="item-meta">مانده لحظه‌ای: <b>${formatMoney(r.balance)} ت</b></div>
    </div>`).join("");
}

function openPaymentModal() {
  const debtOrders = DB.fetchOrders({ status_pill: "بدهکار (مانده‌دار)" });
  const ordOpts = `<option value="">بدون اتصال به سفارش خاص</option>` + debtOrders.map(o =>
    `<option value="${o.id}">سفارش #${o.id} — ${escapeHtml(o.customer_name)} (مانده: ${formatMoney(o.remaining_amount)})</option>`
  ).join("");
  openModal("💳 ثبت دریافت / پرداخت", `
    <div class="grid-2">
      <div class="field-group"><label>نوع</label><select id="pay-dir"><option value="دریافت">دریافت</option><option value="پرداخت">پرداخت</option></select></div>
      <div class="field-group"><label>تاریخ</label><input type="text" id="pay-date" value="${getTodayJalali()}" /></div>
    </div>
    <div class="field-group"><label>بابت سفارش بدهکار (تسویه خودکار)</label><select id="pay-ord" onchange="onPayOrderPicked(this.value)">${ordOpts}</select></div>
    <div class="field-group"><label>نام طرف حساب *</label><input type="text" id="pay-party" /></div>
    <div class="grid-2">
      <div class="field-group"><label>روش</label><select id="pay-method">${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join("")}</select></div>
      <div class="field-group"><label>مبلغ (تومان) *</label><input type="text" inputmode="numeric" id="pay-amt" value="0" /></div>
    </div>
    <div class="field-group"><label>کد پیگیری</label><input type="text" id="pay-ref" /></div>
    <div class="field-group"><label>توضیحات</label><input type="text" id="pay-notes" /></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitPayment()">ثبت سند مالی</button>
  `);
  attachMoneyFormatting(document.getElementById("pay-amt"));
}

function onPayOrderPicked(oid) {
  if (!oid) return;
  const o = DB.getOrder(oid);
  if (o) {
    document.getElementById("pay-dir").value = "دریافت";
    document.getElementById("pay-party").value = o.customer_name;
    document.getElementById("pay-amt").value = formatMoney(o.remaining_amount);
  }
}

function submitPayment() {
  const party = document.getElementById("pay-party").value.trim();
  const amt = parseNumber(document.getElementById("pay-amt").value);
  if (!party || amt <= 0) { toast("نام شخص و مبلغ > 0 الزامی است", "error"); return; }
  DB.addPayment({
    pay_date: document.getElementById("pay-date").value.trim() || getTodayJalali(),
    direction: document.getElementById("pay-dir").value,
    party_name: party,
    order_id: document.getElementById("pay-ord").value || null,
    method: document.getElementById("pay-method").value,
    amount: amt,
    ref_code: document.getElementById("pay-ref").value.trim(),
    notes: document.getElementById("pay-notes").value.trim()
  });
  closeModal();
  refreshAll();
  toast("سند مالی ثبت شد ✅");
}

function openCheckModal() {
  const debtOrders = DB.fetchOrders({ status_pill: "بدهکار (مانده‌دار)" });
  const ordOpts = `<option value="">بدون اتصال به سفارش</option>` + debtOrders.map(o =>
    `<option value="${o.id}">سفارش #${o.id} — ${escapeHtml(o.customer_name)} (${formatMoney(o.remaining_amount)})</option>`
  ).join("");
  openModal("📝 ثبت چک صیادی", `
    <div class="grid-2">
      <div class="field-group"><label>نوع چک</label><select id="chk-dir"><option value="دریافتی">دریافتی</option><option value="پرداختی">پرداختی</option></select></div>
      <div class="field-group"><label>نام بانک</label><input type="text" id="chk-bank" placeholder="ملت، ملی..." /></div>
    </div>
    <div class="field-group"><label>طرف حساب *</label><input type="text" id="chk-party" /></div>
    <div class="grid-2">
      <div class="field-group"><label>شماره چک *</label><input type="text" id="chk-num" /></div>
      <div class="field-group"><label>شناسه ۱۶ رقمی صیادی</label><input type="text" id="chk-sayadi" /></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>مبلغ (تومان) *</label><input type="text" inputmode="numeric" id="chk-amt" value="0" /></div>
      <div class="field-group"><label>تاریخ سررسید *</label><input type="text" id="chk-due" placeholder="1405/10/15" /></div>
    </div>
    <div class="field-group"><label>بابت سفارش (تسویه پس از وصول)</label><select id="chk-ord">${ordOpts}</select></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitCheck()">ثبت چک</button>
  `);
  attachMoneyFormatting(document.getElementById("chk-amt"));
}

function submitCheck() {
  const party = document.getElementById("chk-party").value.trim();
  const num = document.getElementById("chk-num").value.trim();
  const due = document.getElementById("chk-due").value.trim();
  const amt = parseNumber(document.getElementById("chk-amt").value);
  if (!party || !num || !due || amt <= 0) { toast("طرف حساب، شماره چک، سررسید و مبلغ الزامی است", "error"); return; }
  DB.addCheck({
    direction: document.getElementById("chk-dir").value,
    party_name: party, check_number: num,
    sayadi_id: document.getElementById("chk-sayadi").value.trim(),
    bank_name: document.getElementById("chk-bank").value.trim(),
    amount: amt, due_date: due,
    order_id: document.getElementById("chk-ord").value || null
  });
  closeModal();
  refreshAll();
  toast("چک ثبت شد ✅");
}

// ============================================================
// ۶. اشخاص و باشگاه مشتریان
// ============================================================

function switchCustTab(tab) {
  STATE.custTab = tab;
  document.querySelectorAll("[data-custtab]").forEach(b => b.classList.toggle("active", b.dataset.custtab === tab));
  ["crm", "parties"].forEach(t => document.getElementById(`cust-tab-${t}`).style.display = t === tab ? "block" : "none");
  renderCustomers();
}

function renderCustomers() {
  const crm = DB.getCustomersSummary(document.getElementById("crm-search").value);
  document.getElementById("crm-list").innerHTML = crm.length
    ? crm.map(c => `
        <div class="item-card">
          <div class="item-card-head">
            <div><div class="item-title">${escapeHtml(c.customer_name)}</div>
              <div class="item-meta">${escapeHtml(c.phone || "-")} • ${escapeHtml(c.messenger)} • ${c.order_count} سفارش</div>
            </div>
            <span class="badge ${c.total_debt > 0 ? "badge-red" : "badge-green"}">${c.total_debt > 0 ? formatMoney(c.total_debt) + " بدهی" : "تسویه ✅"}</span>
          </div>
          <div class="item-money-row">
            <span>خرید کل: <b>${formatMoney(c.total_spent)} ت</b></span>
            <span>پرداختی: <b>${formatMoney(c.total_paid)} ت</b></span>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="jumpCustomerOrders('${escapeHtml(c.customer_name)}')">مشاهده سفارش‌ها</button>
        </div>`).join("")
    : `<div class="card empty-state">مشتری یافت نشد</div>`;

  const parties = DB.fetchParties(document.getElementById("party-type-filter").value, document.getElementById("party-search").value);
  document.getElementById("parties-list").innerHTML = parties.length
    ? parties.map(p => `
        <div class="item-card">
          <div class="item-card-head">
            <div><div class="item-title">${escapeHtml(p.name)}</div>
              <div class="item-meta">${escapeHtml(p.phone || "-")} • ${escapeHtml(p.price_group)} ${p.credit_limit > 0 ? "• اعتبار: " + formatMoney(p.credit_limit) : ""} ${p.commission_percent > 0 ? "• پورسانت: " + p.commission_percent + "%" : ""}</div>
            </div>
            <span class="badge badge-blue">${escapeHtml(p.party_type)}</span>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="openPartyModal('${escapeHtml(p.party_type)}', null, ${p.id})">✏️ ویرایش</button>
            <button class="btn btn-sm btn-danger" onclick="if(confirm('حذف شود؟')){DB.deleteParty(${p.id});refreshAll();}">🗑️</button>
          </div>
        </div>`).join("")
    : `<div class="card empty-state">شخصی تعریف نشده است</div>`;
}

function jumpCustomerOrders(name) {
  document.getElementById("ord-search").value = name;
  selectOrderPill("همه");
  goPage("orders");
}

function openPartyModal(defaultType = "مشتری", returnTarget = null, partyId = null) {
  const p = partyId ? DB.data.parties.find(x => x.id === partyId) : null;
  openModal(p ? "ویرایش شخص" : "تعریف شخص جدید", `
    <div class="grid-2">
      <div class="field-group"><label>نقش</label><select id="pt-type">
        ${["مشتری", "تأمین‌کننده", "بازاریاب"].map(t => `<option value="${t}" ${(p ? p.party_type : defaultType) === t ? "selected" : ""}>${t}</option>`).join("")}
      </select></div>
      <div class="field-group"><label>گروه قیمتی</label><select id="pt-pg">
        ${["خرده‌فروشی", "عمده‌فروشی", "همکار"].map(g => `<option value="${g}" ${(p && p.price_group === g) ? "selected" : ""}>${g}</option>`).join("")}
      </select></div>
    </div>
    <div class="field-group"><label>نام و نام خانوادگی / شرکت *</label><input type="text" id="pt-name" value="${escapeHtml(p ? p.name : "")}" /></div>
    <div class="grid-2">
      <div class="field-group"><label>شماره تماس</label><input type="tel" id="pt-phone" value="${escapeHtml(p ? p.phone : "")}" /></div>
      <div class="field-group"><label>پیام‌رسان</label><select id="pt-msg">${MESSENGERS.map(m => `<option value="${m}" ${(p && p.messenger === m) ? "selected" : ""}>${m}</option>`).join("")}</select></div>
    </div>
    <div class="grid-2">
      <div class="field-group"><label>کد اقتصادی / ملی</label><input type="text" id="pt-econ" value="${escapeHtml(p ? p.economic_code : "")}" /></div>
      <div class="field-group"><label>سقف اعتبار (تومان)</label><input type="text" inputmode="numeric" id="pt-credit" value="${formatMoney(p ? p.credit_limit : 0)}" /></div>
    </div>
    <div class="field-group"><label>درصد پورسانت (مخصوص بازاریاب)</label><input type="number" step="any" id="pt-comm" value="${p ? p.commission_percent : 0}" /></div>
    <div class="field-group"><label>آدرس</label><input type="text" id="pt-addr" value="${escapeHtml(p ? p.address : "")}" /></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
    <button class="btn btn-primary flex-1" onclick="submitPartyForm(${partyId || "null"}, '${returnTarget || ""}')">ذخیره اطلاعات</button>
  `);
  attachMoneyFormatting(document.getElementById("pt-credit"));
}

function submitPartyForm(partyId, returnTarget) {
  const name = document.getElementById("pt-name").value.trim();
  if (!name) { toast("نام شخص الزامی است", "error"); return; }
  DB.upsertParty({
    party_type: document.getElementById("pt-type").value,
    name,
    phone: document.getElementById("pt-phone").value.trim(),
    messenger: document.getElementById("pt-msg").value,
    price_group: document.getElementById("pt-pg").value,
    economic_code: document.getElementById("pt-econ").value.trim(),
    credit_limit: parseNumber(document.getElementById("pt-credit").value),
    commission_percent: parseNumber(document.getElementById("pt-comm").value),
    address: document.getElementById("pt-addr").value.trim()
  }, partyId);
  closeModal();
  refreshAll();
  if (returnTarget === "invoice") {
    document.getElementById("inv-cust-pick").value = name;
    onInvCustPicked();
  }
  toast(`اطلاعات «${name}» ذخیره شد ✅`);
}

// ============================================================
// ۷. گزارشات تحلیلی، سود و زیان و ارزش افزوده
// ============================================================

function switchRepTab(tab) {
  STATE.repTab = tab;
  document.querySelectorAll("[data-reptab]").forEach(b => b.classList.toggle("active", b.dataset.reptab === tab));
  renderReports();
}

function renderReports() {
  const df = document.getElementById("rep-from").value.trim();
  const dt = document.getElementById("rep-to").value.trim();
  const pl = DB.getProfitLossReport(df, dt);
  document.getElementById("rep-pl-kpis").innerHTML = `
    <div class="kpi-card"><div class="k-label">فروش دوره</div><div class="k-val" style="color:var(--primary)">${formatMoney(pl.total_sales)} ت</div><div class="k-sub">${pl.order_count} سفارش</div></div>
    <div class="kpi-card"><div class="k-label">سود ناخالص</div><div class="k-val" style="color:var(--success)">${formatMoney(pl.gross_profit)} ت</div><div class="k-sub">بهای تمام‌شده: ${formatMoney(pl.total_cogs)} ت</div></div>
  `;

  const body = document.getElementById("rep-body");
  if (STATE.repTab === "top") {
    const rows = DB.getTopSellingReport(df, dt);
    body.innerHTML = rows.length ? rows.map(r => `
      <div class="item-card">
        <div class="item-card-head"><div><div class="item-title">${escapeHtml(r.title)}</div><div class="item-meta">${escapeHtml(r.spec || "-")} • ${r.orders} سفارش</div></div>
          <span class="badge badge-teal">${formatQty(r.qty)} ${escapeHtml(r.unit)}</span></div>
        <div class="item-money-row"><span>فروش: <b>${formatMoney(r.revenue)} ت</b></span><span>سود: <b style="color:var(--success)">${formatMoney(r.profit)} ت</b></span></div>
      </div>`).join("") : `<div class="card empty-state">داده‌ای برای این بازه ثبت نشده</div>`;
  } else if (STATE.repTab === "low") {
    const rows = DB.fetchProducts({ low_stock_only: true });
    body.innerHTML = rows.length ? rows.map(p => `
      <div class="item-card">
        <div class="item-card-head"><div><div class="item-title">${escapeHtml(p.name)}</div><div class="item-meta">${escapeHtml(p.sku)} • ${escapeHtml(p.warehouse_name)}</div></div>
          <span class="badge badge-red">${formatQty(p.stock_qty)} / حداقل ${formatQty(p.min_stock)}</span></div>
      </div>`).join("") : `<div class="card empty-state">✅ کمبود موجودی ندارید</div>`;
  } else if (STATE.repTab === "dead") {
    const rows = DB.getDeadStockReport();
    body.innerHTML = rows.length ? rows.map(p => `
      <div class="item-card">
        <div class="item-card-head"><div><div class="item-title">${escapeHtml(p.name)}</div><div class="item-meta">${escapeHtml(p.sku)} • موجودی راکد: ${formatQty(p.stock_qty)} ${escapeHtml(p.unit_main)}</div></div>
          <span class="badge badge-amber">${formatMoney(p.stock_qty * p.cost_price)} ت</span></div>
      </div>`).join("") : `<div class="card empty-state">کالای راکدی یافت نشد</div>`;
  } else if (STATE.repTab === "vat") {
    const rows = DB.getVatReport(df, dt);
    body.innerHTML = rows.length ? rows.map(i => `
      <div class="item-card">
        <div class="item-card-head"><div><div class="item-title">${escapeHtml(i.invoice_number)} — ${escapeHtml(i.customer_name)}</div><div class="item-meta">${escapeHtml(i.invoice_date)} • ${escapeHtml(i.invoice_type)}</div></div>
          <span class="badge badge-blue">مالیات: ${formatMoney(i.tax_amount)} ت</span></div>
        <div class="item-meta">جمع نهایی: <b>${formatMoney(i.grand_total)} ت</b></div>
      </div>`).join("") : `<div class="card empty-state">فاکتوری در این بازه ثبت نشده</div>`;
  } else {
    const rows = DB.getMarketerReport();
    body.innerHTML = rows.length ? rows.map(m => `
      <div class="item-card">
        <div class="item-card-head"><div><div class="item-title">${escapeHtml(m.marketer_name)}</div><div class="item-meta">${m.cnt} سفارش • فروش: ${formatMoney(m.sales)} ت</div></div>
          <span class="badge badge-green">پورسانت (${m.comm_pct}%): ${formatMoney(m.sales * m.comm_pct / 100)} ت</span></div>
      </div>`).join("") : `<div class="card empty-state">فروشی توسط بازاریاب ثبت نشده</div>`;
  }
}

function exportActiveReportCsv() {
  const df = document.getElementById("rep-from").value.trim();
  const dt = document.getElementById("rep-to").value.trim();
  let csv = "\uFEFF";
  if (STATE.repTab === "top") {
    csv += "کالا,مشخصات,مقدار,فروش,سود\n" + DB.getTopSellingReport(df, dt).map(r => `"${r.title}","${r.spec}",${r.qty},${r.revenue},${r.profit}`).join("\n");
  } else {
    csv += "SKU,نام,موجودی,حداقل,خرده‌فروشی\n" + DB.fetchProducts().map(p => `"${p.sku}","${p.name}",${p.stock_qty},${p.min_stock},${p.retail_price}`).join("\n");
  }
  downloadTextFile(`report_${STATE.repTab}_${getTodayJalali().replace(/\//g, "-")}.csv`, csv, "text/csv;charset=utf-8");
}

// ============================================================
// ۸. تنظیمات، امنیت، پشتیبان‌گیری JSON و جستجوی سراسری
// ============================================================

function switchSetTab(tab) {
  STATE.setTab = tab;
  document.querySelectorAll("[data-settab]").forEach(b => b.classList.toggle("active", b.dataset.settab === tab));
  ["brand", "security", "backup", "cloud"].forEach(t => document.getElementById(`set-tab-${t}`).style.display = t === tab ? "block" : "none");
  renderSettings();
}

function renderSettings() {
  const s = DB.getSettings();
  document.getElementById("set-brand").value = s.brand_name;
  document.getElementById("set-slogan").value = s.brand_slogan;
  document.getElementById("set-phone").value = s.brand_phone;
  document.getElementById("set-social").value = s.brand_social;
  document.getElementById("set-address").value = s.brand_address;
  document.getElementById("set-econ").value = s.seller_economic_code;
  document.getElementById("set-nat").value = s.seller_national_id;
  document.getElementById("set-card").value = s.bank_card;
  document.getElementById("set-owner").value = s.bank_owner;
  document.getElementById("set-prefix").value = s.invoice_prefix;
  document.getElementById("set-footer").value = s.invoice_footer;
  document.getElementById("set-login-lock").checked = s.enable_login_lock === "1";
  document.getElementById("cloud-url").value = s.cloud_server_url || "";
  document.getElementById("cloud-token").value = s.cloud_api_token || "MSP-2026-SYNC";
  document.getElementById("cloud-auto").checked = s.cloud_auto_sync !== "0";
  document.getElementById("cloud-interval").value = String(s.cloud_sync_interval || "20");
  document.getElementById("cloud-meta-info").textContent = `شناسه دستگاه: ${s.cloud_device_id || "-"} | آخرین همگام‌سازی: ${s.cloud_last_sync_at || "هنوز انجام نشده"}`;

  const img = document.getElementById("set-logo-img");
  if (s.logo_base64) { img.src = s.logo_base64; img.style.display = "block"; }
  else img.style.display = "none";

  document.getElementById("users-list").innerHTML = DB.fetchUsers().map(u => `
    <div class="item-card">
      <div class="item-card-head">
        <div><div class="item-title">${escapeHtml(u.full_name)} (${escapeHtml(u.username)})</div><div class="item-meta">نقش: ${u.role} • سقف تخفیف: ${u.max_discount_pct}%</div></div>
        ${u.username !== "admin" ? `<button class="btn btn-sm btn-danger" onclick="DB.deleteUser('${escapeHtml(u.username)}');renderSettings();">حذف</button>` : `<span class="badge badge-green">مدیر اصلی</span>`}
      </div>
    </div>`).join("");

  document.getElementById("audit-logs-list").innerHTML = DB.data.audit_logs.slice(0, 40).map(l => `
    <div style="border-bottom:1px solid var(--border);padding:7px 0;font-size:12px;">
      <b>${escapeHtml(l.action)}</b> — ${escapeHtml(l.target)} <span style="color:var(--muted)">(${escapeHtml(l.log_time)} • ${escapeHtml(l.username)})</span>
      ${l.details ? `<div style="color:var(--muted);font-size:11px;">${escapeHtml(l.details)}</div>` : ""}
    </div>`).join("");
}

function handleLogoUpload(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    DB.saveSettings({ logo_base64: reader.result });
    renderSettings();
    toast("لوگو ذخیره شد ✅");
  };
  reader.readAsDataURL(file);
}

function clearBrandLogo() {
  DB.saveSettings({ logo_base64: "" });
  renderSettings();
  toast("لوگو حذف شد");
}

function saveBrandSettings() {
  DB.saveSettings({
    brand_name: document.getElementById("set-brand").value.trim() || "استودیو چاپ و برچسب",
    brand_slogan: document.getElementById("set-slogan").value.trim(),
    brand_phone: document.getElementById("set-phone").value.trim(),
    brand_social: document.getElementById("set-social").value.trim(),
    brand_address: document.getElementById("set-address").value.trim(),
    seller_economic_code: document.getElementById("set-econ").value.trim(),
    seller_national_id: document.getElementById("set-nat").value.trim(),
    bank_card: document.getElementById("set-card").value.trim(),
    bank_owner: document.getElementById("set-owner").value.trim(),
    invoice_prefix: document.getElementById("set-prefix").value.trim() || "INV-",
    invoice_footer: document.getElementById("set-footer").value.trim()
  });
  refreshAll();
  toast("تنظیمات برند ذخیره شد ✅");
}

function addNewWarehouse() {
  const v = document.getElementById("set-new-wh").value.trim();
  if (!v) return;
  DB.addWarehouse(v);
  document.getElementById("set-new-wh").value = "";
  refreshAll();
  toast(`انبار «${v}» اضافه شد ✅`);
}

function toggleLoginLock(enabled) {
  DB.saveSettings({ enable_login_lock: enabled ? "1" : "0" });
  toast(enabled ? "قفل رمز عبور فعال شد 🔐" : "قفل رمز عبور غیرفعال شد");
}

function saveAppUser() {
  const u = document.getElementById("u-user").value.trim();
  const n = document.getElementById("u-name").value.trim();
  if (!u || !n) { toast("نام کاربری و نام کامل الزامی است", "error"); return; }
  DB.saveUser(u, n, document.getElementById("u-pass").value, document.getElementById("u-role").value, document.getElementById("u-disc").value);
  document.getElementById("u-user").value = "";
  document.getElementById("u-name").value = "";
  document.getElementById("u-pass").value = "";
  renderSettings();
  toast(`کاربر «${u}» ذخیره شد ✅`);
}

function downloadBackupJson() {
  downloadTextFile(`ModiriatSefaresh_Backup_${getTodayJalali().replace(/\//g, "-")}.json`, DB.exportBackupJson(), "application/json");
}

function handleRestoreBackup(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (confirm("اطلاعات فعلی با فایل پشتیبان جایگزین شود؟")) {
        DB.importBackupJson(reader.result);
        refreshAll();
        toast("پشتیبان با موفقیت بازیابی شد ✅");
      }
    } catch (e) { toast(e.message, "error"); }
  };
  reader.readAsText(file);
}

function exportOrdersCsv() {
  const header = "\uFEFFکد,تاریخ,مشتری,تلفن,عنوان,کانال,مبلغ کل,بیعانه,مانده,وضعیت\n";
  const body = DB.data.orders.map(o => `${o.id},"${o.order_date}","${o.customer_name}","${o.phone}","${o.product_title}","${o.messenger}",${o.total_price},${o.deposit_amount},${o.remaining_amount},"${o.workflow_status}"`).join("\n");
  downloadTextFile(`orders_${getTodayJalali().replace(/\//g, "-")}.csv`, header + body, "text/csv;charset=utf-8");
}

function exportProductsCsv() {
  const header = "\uFEFFSKU,بارکد,نام,نوع,سایز,موجودی,تمام‌شده,خرده‌فروشی,عمده‌فروشی,همکار\n";
  const body = DB.data.products.map(p => `"${p.sku}","${p.barcode}","${p.name}","${p.product_type}","${p.size_spec}",${p.stock_qty},${p.cost_price},${p.retail_price},${p.wholesale_price},${p.partner_price}`).join("\n");
  downloadTextFile(`products_${getTodayJalali().replace(/\//g, "-")}.csv`, header + body, "text/csv;charset=utf-8");
}

// ---- جستجوی سراسری ----
function openGlobalSearch() {
  openModal("🔍 جستجوی سراسری", `
    <input type="text" id="gs-input" placeholder="نام مشتری، کد سفارش، سایز برچسب، بارکد یا شماره فاکتور..." oninput="runGlobalSearch()" style="margin-bottom:10px;" />
    <div id="gs-results"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">بستن</button>`);
  setTimeout(() => document.getElementById("gs-input").focus(), 60);
  runGlobalSearch();
}

function runGlobalSearch() {
  const items = DB.globalSearch(document.getElementById("gs-input").value);
  document.getElementById("gs-results").innerHTML = items.length
    ? items.map(it => `<div class="item-card" style="cursor:pointer;" onclick="jumpGlobalResult('${it.kind}', ${JSON.stringify(it.id).replace(/"/g, "&quot;")})">${escapeHtml(it.label)}</div>`).join("")
    : `<div class="empty-state">نتیجه‌ای یافت نشد</div>`;
}

function jumpGlobalResult(kind, id) {
  closeModal();
  if (kind === "order") { goPage("orders"); openOrderModal(id); }
  else if (kind === "product") { goPage("inventory"); openProductModal(id); }
  else if (kind === "customer") { jumpCustomerOrders(id); }
  else if (kind === "invoice") {
    goPage("invoices");
    document.getElementById("inv-archive-select").value = id;
    loadArchiveInvoice();
  }
}

function closeStockPicker() {
  if (STATE.stockPickerTarget === "order" && STATE.tempOrderDraft) {
    openOrderModal(STATE.editingOrderId, null, true);
  } else {
    closeModal();
  }
}

// ============================================================
// ۹. موتور همگام‌سازی ابری آفلاین‌محور (Cloud Sync Engine)
// ============================================================

let _cloudTimer = null;
let _cloudBusy = false;

function normalizeCloudUrl(url) {
  let u = String(url || "").trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = "http://" + u;
  return u;
}

function setCloudPill(text, bg = "", fg = "") {
  const btn = document.getElementById("btn-cloud-pill");
  if (!btn) return;
  btn.textContent = text;
  btn.style.background = bg || "";
  btn.style.color = fg || "";
}

function initCloudSyncEngine() {
  window.addEventListener("online", () => triggerCloudSync(false, false));
  reloadCloudSchedule();
  setTimeout(() => triggerCloudSync(false, false), 1500);
}

function reloadCloudSchedule() {
  if (_cloudTimer) clearInterval(_cloudTimer);
  const s = DB.getSettings();
  const url = normalizeCloudUrl(s.cloud_server_url);
  if (!url) {
    setCloudPill("⚪ محلی");
    return;
  }
  setCloudPill("🔄 آماده");
  if (s.cloud_auto_sync !== "0") {
    const sec = Math.max(10, Number(s.cloud_sync_interval) || 20);
    _cloudTimer = setInterval(() => triggerCloudSync(false, false), sec * 1000);
  }
}

function onCloudPillTap() {
  const s = DB.getSettings();
  if (!normalizeCloudUrl(s.cloud_server_url)) {
    goPage("settings");
    switchSetTab("cloud");
  } else {
    triggerCloudSync(false, true);
  }
}

function saveCloudConfig() {
  DB.saveSettings({
    cloud_server_url: document.getElementById("cloud-url").value.trim(),
    cloud_api_token: document.getElementById("cloud-token").value.trim() || "MSP-2026-SYNC",
    cloud_auto_sync: document.getElementById("cloud-auto").checked ? "1" : "0",
    cloud_sync_interval: document.getElementById("cloud-interval").value || "20"
  });
  reloadCloudSchedule();
  renderSettings();
  toast("تنظیمات همگام‌سازی ابری ذخیره شد ✅");
}

async function testCloudServer() {
  saveCloudConfig();
  const s = DB.getSettings();
  const base = normalizeCloudUrl(s.cloud_server_url);
  const msgEl = document.getElementById("cloud-status-msg");
  if (!base) {
    msgEl.style.color = "var(--danger)";
    msgEl.textContent = "❌ لطفاً آدرس سرور را وارد کنید.";
    return;
  }
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = "⏳ در حال برقراری ارتباط با سرور...";
  try {
    const res = await fetch(`${base}/api/health`, {
      headers: { "Authorization": `Bearer ${s.cloud_api_token}` }
    });
    if (!res.ok) {
      msgEl.style.color = "var(--danger)";
      msgEl.textContent = res.status === 401 || res.status === 403
        ? "❌ کلید امنیتی (API Token) اشتباه است."
        : `❌ خطای سرور (${res.status})`;
      return;
    }
    const data = await res.json();
    const c = data.counts || {};
    msgEl.style.color = "var(--success)";
    msgEl.textContent = `✅ اتصال برقرار شد! (سفارش‌ها: ${c.orders || 0} | کالاها: ${c.products || 0})`;
  } catch (e) {
    msgEl.style.color = "var(--danger)";
    msgEl.textContent = "⚠️ عدم دسترسی به سرور — برنامه در حالت آفلاین بدون اختلال کار می‌کند.";
  }
}

async function triggerCloudSync(fullPush = false, showFeedback = false) {
  const s = DB.getSettings();
  const base = normalizeCloudUrl(s.cloud_server_url);
  if (!base) {
    setCloudPill("⚪ محلی");
    if (showFeedback) toast("ابتدا آدرس سرور را وارد کنید", "warning");
    return;
  }
  if (_cloudBusy) return;
  _cloudBusy = true;
  setCloudPill("🟡 سینک...", "#FFFBEB", "#B45309");

  try {
    const payload = DB.buildSyncPayload(fullPush);
    const res = await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${s.cloud_api_token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      setCloudPill("🔴 خطا", "#FEF2F2", "#BE123C");
      if (showFeedback) toast(`خطا در همگام‌سازی (${res.status})`, "error");
      _cloudBusy = false;
      return;
    }
    const respData = await res.json();
    const hadRemote = DB.applySyncResponse(respData);
    setCloudPill("🟢 آنلاین", "#ECFDF5", "#047857");
    if (hadRemote) {
      refreshAll();
      toast("داده‌های جدید از سرور دریافت و به‌روز شد ☁️");
    } else if (showFeedback) {
      toast("همگام‌سازی با سرور انجام شد ✅");
    }
    if (STATE.page === "settings") renderSettings();
  } catch (e) {
    setCloudPill("🔴 آفلاین", "#FEF2F2", "#BE123C");
    if (showFeedback) toast("اینترنت قطع است؛ اطلاعات محلی محفوظ است", "warning");
  } finally {
    _cloudBusy = false;
  }
}
