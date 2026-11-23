/* ============================================================
   موتور دیتابیس آفلاین اندروید (سازگار کامل با تمام جداول نسخه دسکتاپ ۳.۲)
   ذخیره‌سازی دائمی روی گوشی با localStorage + پشتیبان‌گیری کامل JSON
   ============================================================ */

const STORAGE_KEY = "ModiriatSefareshPro_Android_DB_v32";

const DEFAULT_SETTINGS = {
  brand_name: "استودیو چاپ و برچسب حرارتی",
  brand_slogan: "تولید و فروش رول برچسب حرارتی، ریبون و چاپ اختصاصی",
  brand_phone: "0912-000-0000",
  brand_address: "اصفهان / تهران",
  brand_social: "@your_brand",
  seller_economic_code: "",
  seller_national_id: "",
  fiscal_year: "1405",
  default_tax_percent: "10",
  bank_card: "6037-9975-0000-0000",
  bank_owner: "نام صاحب حساب",
  invoice_prefix: "INV-",
  invoice_accent: "#2F6F5E",
  invoice_footer: "سفارش چاپ سفارشی پس از تأیید نهایی طرح و واریز پیش‌پرداخت وارد مرحله تولید می‌شود. از اعتماد شما سپاسگزاریم.",
  logo_base64: "",
  enable_login_lock: "0",
  ui_dark_mode: "0",
  ui_font_size: "14",
  cloud_server_url: "",
  cloud_api_token: "MSP-2026-SYNC",
  cloud_auto_sync: "1",
  cloud_sync_interval: "20",
  cloud_last_sync_at: "",
  cloud_device_id: ""
};

class AppStore {
  constructor() {
    this.currentUser = { username: "admin", full_name: "مدیر سیستم", role: "مدیر", max_discount_pct: 100 };
    this.data = this._load();
    this._ensureSchema();
  }

  _defaultData() {
    return {
      seq: { orders: 1, products: 1, stock_movements: 1, invoices: 1, parties: 1, payments: 1, checks: 1, audit_logs: 1, price_history: 1 },
      orders: [],
      products: [],
      stock_movements: [],
      price_history: [],
      invoices: [],
      parties: [],
      payments: [],
      checks: [],
      warehouses: [
        { name: "انبار اصلی", location: "محصولات آماده و عمومی" },
        { name: "انبار مواد اولیه (رول مادر)", location: "جامبو رول، چسب و ریبون خام" },
        { name: "انبار فروشگاه / ارسال", location: "آماده تحویل سریع" }
      ],
      users: [
        { username: "admin", full_name: "مدیر سیستم", password: "1234", role: "مدیر", max_discount_pct: 100, is_active: true }
      ],
      sync_deletions: [],
      audit_logs: [],
      settings: { ...DEFAULT_SETTINGS }
    };
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) {
      console.error("Load error:", e);
    }
    return this._defaultData();
  }

  _ensureSchema() {
    const def = this._defaultData();
    if (!this.data.seq) this.data.seq = { ...def.seq };
    for (const k of Object.keys(def.seq)) {
      if (!this.data.seq[k]) this.data.seq[k] = 1;
    }
    for (const arr of ["orders", "products", "stock_movements", "price_history", "invoices", "parties", "payments", "checks", "warehouses", "users", "sync_deletions", "audit_logs"]) {
      if (!Array.isArray(this.data[arr])) this.data[arr] = def[arr];
    }
    if (!this.data.warehouses.length) this.data.warehouses = def.warehouses;
    if (!this.data.users.length) this.data.users = def.users;
    this.data.settings = { ...DEFAULT_SETTINGS, ...(this.data.settings || {}) };
    if (!this.data.settings.cloud_device_id) {
      this.data.settings.cloud_device_id = "and-" + makeUuid().slice(0, 10);
    }
    const nowIso = utcNowIso();
    for (const tbl of ["orders", "products", "stock_movements", "invoices", "parties", "payments", "checks", "warehouses"]) {
      for (const row of this.data[tbl]) {
        if (!row.sync_uuid) row.sync_uuid = makeUuid();
        if (!row.updated_at) row.updated_at = nowIso;
      }
    }
    this._save();
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error("Save error:", e);
    }
  }

  _nextId(table) {
    const id = this.data.seq[table] || 1;
    this.data.seq[table] = id + 1;
    return id;
  }

  logAction(action, target = "", details = "") {
    this.data.audit_logs.unshift({
      id: this._nextId("audit_logs"),
      log_time: getNowJalaliStr(),
      username: this.currentUser.username || "admin",
      action, target, details
    });
    if (this.data.audit_logs.length > 250) this.data.audit_logs.length = 250;
    this._save();
  }


  _recordDeletion(tableName, row) {
    if (!row || !row.sync_uuid) return;
    const delAt = utcNowIso();
    const existing = this.data.sync_deletions.find(x => x.table === tableName && x.sync_uuid === row.sync_uuid);
    if (existing) existing.deleted_at = delAt;
    else this.data.sync_deletions.push({ table: tableName, sync_uuid: row.sync_uuid, deleted_at: delAt });
  }

  // ---- تنظیمات ----
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...(this.data.settings || {}) };
  }

  saveSettings(patch) {
    this.data.settings = { ...this.getSettings(), ...patch };
    this.logAction("ذخیره تنظیمات", "تنظیمات برند و برنامه", "");
  }

  // ---- کاربران ----
  authenticateUser(username, password) {
    const u = this.data.users.find(x => x.username === username.trim() && x.password === password && x.is_active !== false);
    if (u) this.currentUser = { ...u };
    return u || null;
  }

  fetchUsers() { return [...this.data.users]; }

  saveUser(username, fullName, password, role, maxDiscountPct) {
    const u = username.trim();
    const existing = this.data.users.find(x => x.username === u);
    if (existing) {
      existing.full_name = fullName.trim();
      if (password) existing.password = password;
      existing.role = role;
      existing.max_discount_pct = Number(maxDiscountPct) || 0;
    } else {
      this.data.users.push({
        username: u, full_name: fullName.trim(),
        password: password || "1234", role,
        max_discount_pct: Number(maxDiscountPct) || 0, is_active: true
      });
    }
    this.logAction("مدیریت کاربر", u, `نقش: ${role}`);
  }

  deleteUser(username) {
    if (username === "admin") return;
    this.data.users = this.data.users.filter(x => x.username !== username);
    this._save();
  }

  // ---- انبارها ----
  getWarehouses() { return this.data.warehouses.map(w => w.name); }

  addWarehouse(name, location = "") {
    const clean = name.trim();
    if (!clean || this.data.warehouses.some(w => w.name === clean)) return;
    this.data.warehouses.push({ sync_uuid: makeUuid(), name: clean, location: location.trim(), notes: "", updated_at: utcNowIso() });
    this._save();
  }

  // ---- کالاها و انبارداری تخصصی ----
  nextSku(productType = "رول برچسب") {
    const map = {
      "رول برچسب": "LBL", "ریبون": "RBN", "رول مادر (Jumbo)": "JMB",
      "پرینتر لیبل‌زن": "PRT", "بارکدخوان": "SCN", "لوازم جانبی": "ACC", "خدمات / چاپ": "SRV"
    };
    const pref = map[productType] || "PRD";
    return `${pref}-${1001 + this.data.products.length}`;
  }

  addProduct(d) {
    if (this.data.products.some(p => p.sku.toLowerCase() === d.sku.toLowerCase())) {
      throw new Error("کد کالا (SKU) تکراری است.");
    }
    const id = this._nextId("products");
    const prod = {
      id,
      sync_uuid: makeUuid(),
      sku: d.sku, barcode: d.barcode || "", name: d.name,
      product_type: d.product_type || "رول برچسب",
      category: d.category || "", brand: d.brand || "",
      unit_main: d.unit_main || "رول", unit_sub: d.unit_sub || "کارتن",
      conversion_factor: Math.max(1, Number(d.conversion_factor) || 1),
      size_spec: d.size_spec || "", columns_count: d.columns_count || "",
      print_method: d.print_method || "", material: d.material || "",
      adhesive_type: d.adhesive_type || "", core_size: d.core_size || "",
      outer_diameter: d.outer_diameter || "",
      labels_per_roll: Number(d.labels_per_roll) || 0,
      roll_meters: Number(d.roll_meters) || 0,
      gap_type: d.gap_type || "", ribbon_type: d.ribbon_type || "",
      ribbon_wind: d.ribbon_wind || "",
      warehouse_name: d.warehouse_name || "انبار اصلی",
      shelf_location: d.shelf_location || "",
      stock_qty: Number(d.stock_qty) || 0,
      min_stock: Number(d.min_stock) || 5,
      batch_lot: d.batch_lot || "",
      production_date: d.production_date || getTodayJalali(),
      cost_price: Number(d.cost_price) || 0,
      retail_price: Number(d.retail_price) || 0,
      wholesale_price: Number(d.wholesale_price) || 0,
      partner_price: Number(d.partner_price) || 0,
      tier1_min_qty: Number(d.tier1_min_qty) || 0,
      tier1_price: Number(d.tier1_price) || 0,
      tier2_min_qty: Number(d.tier2_min_qty) || 0,
      tier2_price: Number(d.tier2_price) || 0,
      tax_rate: Number(d.tax_rate) || 10,
      notes: d.notes || "",
      updated_at: utcNowIso()
    };
    this.data.products.unshift(prod);
    if (prod.stock_qty > 0) {
      this.data.stock_movements.unshift({
        id: this._nextId("stock_movements"),
        move_date: getTodayJalali(),
        move_type: "رسید اول دوره",
        product_id: id,
        warehouse_from: "", warehouse_to: prod.warehouse_name,
        qty_change: prod.stock_qty, waste_qty: 0,
        unit_cost: prod.cost_price, batch_lot: prod.batch_lot,
        ref_type: "init", ref_id: null, notes: "موجودی اولیه تعریف کالا",
        sync_uuid: makeUuid(), updated_at: utcNowIso()
      });
    }
    this.logAction("تعریف کالا", prod.sku, prod.name);
    return id;
  }

  updateProduct(pid, d) {
    const prod = this.getProduct(pid);
    if (!prod) return;
    for (const f of ["cost_price", "retail_price", "wholesale_price", "partner_price"]) {
      const ov = Number(prod[f]) || 0;
      const nv = Number(d[f]) || 0;
      if (Math.abs(ov - nv) > 0.01) {
        this.data.price_history.unshift({
          id: this._nextId("price_history"),
          change_date: getTodayJalali(),
          product_id: pid, field_name: f, old_value: ov, new_value: nv, reason: "ویرایش دستی"
        });
      }
    }
    Object.assign(prod, {
      sku: d.sku, barcode: d.barcode || "", name: d.name,
      product_type: d.product_type || "رول برچسب",
      category: d.category || "", brand: d.brand || "",
      unit_main: d.unit_main || "رول", unit_sub: d.unit_sub || "کارتن",
      conversion_factor: Math.max(1, Number(d.conversion_factor) || 1),
      size_spec: d.size_spec || "", columns_count: d.columns_count || "",
      print_method: d.print_method || "", material: d.material || "",
      adhesive_type: d.adhesive_type || "", core_size: d.core_size || "",
      outer_diameter: d.outer_diameter || "",
      labels_per_roll: Number(d.labels_per_roll) || 0,
      roll_meters: Number(d.roll_meters) || 0,
      gap_type: d.gap_type || "", ribbon_type: d.ribbon_type || "",
      ribbon_wind: d.ribbon_wind || "",
      warehouse_name: d.warehouse_name || "انبار اصلی",
      shelf_location: d.shelf_location || "",
      min_stock: Number(d.min_stock) || 0,
      batch_lot: d.batch_lot || "",
      production_date: d.production_date || "",
      cost_price: Number(d.cost_price) || 0,
      retail_price: Number(d.retail_price) || 0,
      wholesale_price: Number(d.wholesale_price) || 0,
      partner_price: Number(d.partner_price) || 0,
      tier1_min_qty: Number(d.tier1_min_qty) || 0,
      tier1_price: Number(d.tier1_price) || 0,
      tier2_min_qty: Number(d.tier2_min_qty) || 0,
      tier2_price: Number(d.tier2_price) || 0,
      tax_rate: Number(d.tax_rate) || 10,
      notes: d.notes || "",
      updated_at: utcNowIso()
    });
    this.logAction("ویرایش کالا", prod.sku, prod.name);
  }

  deleteProduct(pid) {
    const p = this.getProduct(pid);
    this._recordDeletion("products", p);
    this.data.products = this.data.products.filter(x => x.id !== pid);
    if (p) this.logAction("حذف کالا", p.sku, p.name);
  }

  getProduct(pid) { return this.data.products.find(x => x.id === Number(pid)) || null; }

  getProductByBarcodeOrSku(code) {
    const n = normalizePersian(code);
    if (!n) return null;
    return this.data.products.find(p => normalizePersian(p.barcode) === n || normalizePersian(p.sku) === n) || null;
  }

  fetchProducts({ search = "", product_type = "همه", material = "همه", size_filter = "", warehouse = "همه", low_stock_only = false } = {}) {
    const nq = normalizePersian(search);
    const ns = normalizePersian(size_filter);
    return this.data.products.filter(p => {
      if (product_type !== "همه" && p.product_type !== product_type) return false;
      if (material !== "همه" && p.material !== material) return false;
      if (warehouse !== "همه" && p.warehouse_name !== warehouse) return false;
      if (low_stock_only && (Number(p.stock_qty) || 0) > (Number(p.min_stock) || 0)) return false;
      if (ns && !normalizePersian(p.size_spec).includes(ns)) return false;
      if (nq) {
        const hay = normalizePersian(`${p.name} ${p.sku} ${p.barcode} ${p.size_spec} ${p.material} ${p.brand} ${p.batch_lot}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }

  recordStockMovement(productId, moveType, qtyChange, { unitCost = 0, warehouseFrom = "", warehouseTo = "", wasteQty = 0, batchLot = "", refType = "", refId = null, notes = "" } = {}) {
    const prod = this.getProduct(productId);
    if (!prod) return false;
    const oldQty = Number(prod.stock_qty) || 0;
    const oldCost = Number(prod.cost_price) || 0;
    const chg = Number(qtyChange) || 0;
    const newQty = oldQty + chg;
    let newCost = oldCost;
    if (chg > 0 && unitCost > 0) {
      newCost = oldQty > 0 ? ((oldQty * oldCost) + (chg * unitCost)) / Math.max(newQty, 0.0001) : unitCost;
    }
    prod.stock_qty = newQty;
    prod.cost_price = Math.round(newCost);
    if (warehouseTo) prod.warehouse_name = warehouseTo;
    if (batchLot) prod.batch_lot = batchLot;
    prod.updated_at = utcNowIso();

    this.data.stock_movements.unshift({
      sync_uuid: makeUuid(), updated_at: utcNowIso(),
      id: this._nextId("stock_movements"),
      move_date: getTodayJalali(),
      move_type: moveType,
      product_id: Number(productId),
      warehouse_from: warehouseFrom,
      warehouse_to: prod.warehouse_name,
      qty_change: chg,
      waste_qty: Number(wasteQty) || 0,
      unit_cost: Number(unitCost) || oldCost,
      batch_lot: prod.batch_lot,
      ref_type: refType, ref_id: refId,
      notes
    });
    this.logAction("سند انبار", `${moveType} | ${prod.sku}`, `تغییر: ${formatQty(chg)} | ${notes}`);
    return true;
  }

  performJumboSlitting(jumboId, consumedQty, wasteQty, outputId, producedRolls, batchLot = "", notes = "") {
    const jumbo = this.getProduct(jumboId);
    const outP = this.getProduct(outputId);
    if (!jumbo || !outP || consumedQty <= 0 || producedRolls <= 0) return false;
    const totalOut = consumedQty + Math.max(0, wasteQty);
    const jCost = Number(jumbo.cost_price) || 0;
    const outCost = jCost > 0 ? (totalOut * jCost) / producedRolls : (Number(outP.cost_price) || 0);
    const lot = batchLot || `LOT-${getTodayJalali().replace(/\//g, "")}`;

    this.recordStockMovement(jumboId, "مصرف برش رول مادر", -totalOut, {
      unitCost: jCost, warehouseFrom: jumbo.warehouse_name, wasteQty, batchLot: lot,
      refType: "slitting", refId: outputId,
      notes: `تبدیل به ${formatQty(producedRolls)} عدد ${outP.name} (ضایعات: ${formatQty(wasteQty)}) ${notes}`
    });
    this.recordStockMovement(outputId, "رسید تولید (برش)", producedRolls, {
      unitCost: outCost, warehouseTo: outP.warehouse_name, batchLot: lot,
      refType: "slitting", refId: jumboId,
      notes: `تولید از ${jumbo.name} (مصرف: ${formatQty(consumedQty)} + ضایعات: ${formatQty(wasteQty)}) ${notes}`
    });
    return true;
  }

  getProductCard(pid) {
    return this.data.stock_movements.filter(m => m.product_id === Number(pid)).slice(0, 150);
  }

  bulkUpdatePrices({ product_type = "همه", material = "همه", mode = "percent", value = 0, targetFields = ["retail_price", "wholesale_price", "partner_price"], reason = "تعدیل قیمت" }) {
    let cnt = 0;
    for (const p of this.data.products) {
      if (product_type !== "همه" && p.product_type !== product_type) continue;
      if (material !== "همه" && p.material !== material) continue;
      let changed = false;
      for (const f of targetFields) {
        const ov = Number(p[f]) || 0;
        if (ov <= 0 && mode === "percent") continue;
        const nv = mode === "percent"
          ? Math.max(0, Math.round((ov * (1 + value / 100)) / 100) * 100)
          : Math.max(0, ov + value);
        if (Math.abs(nv - ov) > 0.01) {
          p[f] = nv;
          changed = true;
          this.data.price_history.unshift({
            id: this._nextId("price_history"),
            change_date: getTodayJalali(),
            product_id: p.id, field_name: f, old_value: ov, new_value: nv, reason
          });
        }
      }
      if (changed) {
        p.updated_at = utcNowIso();
        cnt++;
      }
    }
    this.logAction("آپدیت دسته‌جمعی قیمت", `${cnt} کالا`, `${mode}: ${value} | ${reason}`);
    return cnt;
  }

  // ---- اشخاص (مشتری، تأمین‌کننده، بازاریاب) ----
  upsertParty(d, partyId = null) {
    const cleanName = d.name.trim();
    if (!cleanName) return;
    let existing = partyId ? this.data.parties.find(x => x.id === Number(partyId)) : this.data.parties.find(x => x.name === cleanName);
    if (existing) {
      Object.assign(existing, {
        party_type: d.party_type || "مشتری",
        name: cleanName,
        phone: d.phone !== undefined ? d.phone : existing.phone,
        messenger: d.messenger || existing.messenger || "واتساپ",
        address: d.address !== undefined ? d.address : existing.address,
        economic_code: d.economic_code !== undefined ? d.economic_code : existing.economic_code,
        national_id: d.national_id !== undefined ? d.national_id : existing.national_id,
        price_group: d.price_group || "خرده‌فروشی",
        credit_limit: Number(d.credit_limit) || 0,
        commission_percent: Number(d.commission_percent) || 0,
        marketer_name: d.marketer_name || "",
        notes: d.notes || "",
        updated_at: utcNowIso()
      });
    } else {
      this.data.parties.unshift({
        id: this._nextId("parties"),
        sync_uuid: makeUuid(),
        updated_at: utcNowIso(),
        party_type: d.party_type || "مشتری",
        name: cleanName,
        phone: d.phone || "",
        messenger: d.messenger || "واتساپ",
        address: d.address || "",
        economic_code: d.economic_code || "",
        national_id: d.national_id || "",
        price_group: d.price_group || "خرده‌فروشی",
        credit_limit: Number(d.credit_limit) || 0,
        commission_percent: Number(d.commission_percent) || 0,
        marketer_name: d.marketer_name || "",
        notes: d.notes || ""
      });
    }
    this._save();
  }

  deleteParty(pid) {
    const p = this.data.parties.find(x => x.id === Number(pid));
    this._recordDeletion("parties", p);
    this.data.parties = this.data.parties.filter(x => x.id !== Number(pid));
    this._save();
  }

  getPartyByName(name) {
    return this.data.parties.find(x => x.name === String(name || "").trim()) || null;
  }

  fetchParties(partyType = "همه", search = "") {
    const nq = normalizePersian(search);
    return this.data.parties.filter(p => {
      if (partyType !== "همه" && p.party_type !== partyType) return false;
      if (nq) {
        const hay = normalizePersian(`${p.name} ${p.phone} ${p.economic_code} ${p.address}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }

  getMarketers() {
    return this.data.parties.filter(p => p.party_type === "بازاریاب").map(p => p.name);
  }

  getCustomerDebt(customerName) {
    const clean = String(customerName || "").trim();
    return this.data.orders
      .filter(o => o.customer_name === clean && o.workflow_status !== "لغو / مرجوعی")
      .reduce((s, o) => s + (Number(o.remaining_amount) || 0), 0);
  }

  getAllCustomersDirectory() {
    const map = new Map();
    for (const p of this.data.parties.filter(x => x.party_type === "مشتری")) {
      map.set(p.name, { ...p });
    }
    for (const o of this.data.orders) {
      const name = (o.customer_name || "").trim();
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, {
          name, phone: o.phone || "", address: o.address || "",
          messenger: o.messenger || "واتساپ", economic_code: "", national_id: "",
          price_group: "خرده‌فروشی", credit_limit: 0, marketer_name: o.marketer_name || ""
        });
      }
    }
    return Array.from(map.values());
  }

  // ---- سفارش‌ها ----
  addOrder(d, deductStock = false) {
    const id = this._nextId("orders");
    const order = {
      id,
      sync_uuid: makeUuid(),
      updated_at: utcNowIso(),
      order_date: d.order_date || getTodayJalali(),
      delivery_date: d.delivery_date || "",
      customer_name: d.customer_name.trim(),
      phone: d.phone || "",
      address: d.address || "",
      messenger: d.messenger || "واتساپ",
      order_kind: d.order_kind || "چاپ سفارشی",
      workflow_status: d.workflow_status || "دریافت طرح",
      product_title: d.product_title || "",
      items: Array.isArray(d.items) ? d.items : [],
      design_cost: Number(d.design_cost) || 0,
      cliche_cost: Number(d.cliche_cost) || 0,
      packaging_cost: Number(d.packaging_cost) || 0,
      discount: Number(d.discount) || 0,
      shipping_cost: Number(d.shipping_cost) || 0,
      total_price: Number(d.total_price) || 0,
      total_cost: Number(d.total_cost) || 0,
      has_deposit: Boolean(d.has_deposit),
      deposit_amount: Number(d.deposit_amount) || 0,
      remaining_amount: Number(d.remaining_amount) || 0,
      stage_design: d.stage_design ? 1 : 0,
      stage_print: d.stage_print ? 1 : 0,
      stage_ship: d.stage_ship ? 1 : 0,
      marketer_name: d.marketer_name || "",
      stock_deducted: Boolean(deductStock),
      tracking_code: d.tracking_code || "",
      notes: d.notes || ""
    };
    this.data.orders.unshift(order);

    if (!this.getPartyByName(order.customer_name)) {
      this.upsertParty({
        party_type: "مشتری", name: order.customer_name, phone: order.phone,
        messenger: order.messenger, address: order.address, marketer_name: order.marketer_name
      });
    }
    if (order.deposit_amount > 0) {
      this.data.payments.unshift({
        id: this._nextId("payments"),
        pay_date: order.order_date, direction: "دریافت", party_name: order.customer_name,
        order_id: id, method: "بیعانه سفارش", amount: order.deposit_amount,
        ref_code: "", notes: `بیعانه اولیه سفارش #${id}`,
        sync_uuid: makeUuid(), updated_at: utcNowIso()
      });
    }
    if (deductStock) this._deductOrderStock(id, order.items, order.customer_name);
    this.logAction("ثبت سفارش", `#${id} | ${order.customer_name}`, `${formatMoney(order.total_price)} ت`);
    return id;
  }

  _deductOrderStock(orderId, items, customerName) {
    for (const it of items || []) {
      if (it.product_id && Number(it.quantity) > 0) {
        this.recordStockMovement(it.product_id, "حواله خروج (فروش)", -Number(it.quantity), {
          refType: "order", refId: orderId, notes: `بابت سفارش #${orderId} — ${customerName}`
        });
      }
    }
  }

  updateOrder(oid, d, deductStock = false) {
    const o = this.getOrder(oid);
    if (!o) return;
    const shouldDeduct = deductStock && !o.stock_deducted;
    Object.assign(o, {
      order_date: d.order_date || o.order_date,
      delivery_date: d.delivery_date || "",
      customer_name: d.customer_name.trim(),
      phone: d.phone || "",
      address: d.address || "",
      messenger: d.messenger || "واتساپ",
      order_kind: d.order_kind || "چاپ سفارشی",
      workflow_status: d.workflow_status || "دریافت طرح",
      product_title: d.product_title || "",
      items: Array.isArray(d.items) ? d.items : [],
      design_cost: Number(d.design_cost) || 0,
      cliche_cost: Number(d.cliche_cost) || 0,
      packaging_cost: Number(d.packaging_cost) || 0,
      discount: Number(d.discount) || 0,
      shipping_cost: Number(d.shipping_cost) || 0,
      total_price: Number(d.total_price) || 0,
      total_cost: Number(d.total_cost) || 0,
      has_deposit: Boolean(d.has_deposit),
      deposit_amount: Number(d.deposit_amount) || 0,
      remaining_amount: Number(d.remaining_amount) || 0,
      stage_design: d.stage_design ? 1 : 0,
      stage_print: d.stage_print ? 1 : 0,
      stage_ship: d.stage_ship ? 1 : 0,
      marketer_name: d.marketer_name || "",
      stock_deducted: o.stock_deducted || shouldDeduct,
      tracking_code: d.tracking_code || "",
      notes: d.notes || "",
      updated_at: utcNowIso()
    });
    if (shouldDeduct) this._deductOrderStock(oid, o.items, o.customer_name);
    this.logAction("ویرایش سفارش", `#${oid} | ${o.customer_name}`, o.workflow_status);
  }

  deleteOrder(oid) {
    const o = this.getOrder(oid);
    this._recordDeletion("orders", o);
    this.data.orders = this.data.orders.filter(x => x.id !== Number(oid));
    if (o) this.logAction("حذف سفارش", `#${oid}`, o.customer_name);
  }

  getOrder(oid) { return this.data.orders.find(x => x.id === Number(oid)) || null; }

  advanceWorkflowStatus(oid, newStatus) {
    const o = this.getOrder(oid);
    if (!o) return;
    o.workflow_status = newStatus;
    o.stage_design = ["تأیید طرح", "در حال چاپ", "برش و رول‌پیچی", "بسته‌بندی", "ارسال شده", "تحویل شده"].includes(newStatus) ? 1 : 0;
    o.stage_print = ["برش و رول‌پیچی", "بسته‌بندی", "ارسال شده", "تحویل شده"].includes(newStatus) ? 1 : 0;
    o.stage_ship = ["ارسال شده", "تحویل شده"].includes(newStatus) ? 1 : 0;
    o.updated_at = utcNowIso();
    this.logAction("تغییر وضعیت سفارش", `#${oid}`, newStatus);
  }

  markOrderPaid(oid) {
    const o = this.getOrder(oid);
    if (!o) return;
    const rem = Number(o.remaining_amount) || 0;
    o.has_deposit = true;
    o.deposit_amount = o.total_price;
    o.remaining_amount = 0;
    o.updated_at = utcNowIso();
    if (rem > 0) {
      this.data.payments.unshift({
        id: this._nextId("payments"),
        pay_date: getTodayJalali(), direction: "دریافت", party_name: o.customer_name,
        order_id: oid, method: "تسویه سریع", amount: rem,
        ref_code: "", notes: `تسویه کامل سفارش #${oid}`,
        sync_uuid: makeUuid(), updated_at: utcNowIso()
      });
    }
    this.logAction("تسویه سفارش", `#${oid}`, `${formatMoney(rem)} ت`);
  }

  fetchOrders({ search = "", messenger = "همه", status_pill = "همه", order_kind = "همه" } = {}) {
    const nq = normalizePersian(search);
    const today = getTodayJalali();
    return this.data.orders.filter(o => {
      if (messenger !== "همه" && o.messenger !== messenger) return false;
      if (order_kind !== "همه" && o.order_kind !== order_kind) return false;

      if (status_pill === "سفارش‌های امروز" && o.order_date !== today) return false;
      else if (status_pill === "سفارش‌های باز" && (o.stage_ship === 1 || o.workflow_status === "لغو / مرجوعی")) return false;
      else if (status_pill === "در انتظار طراحی" && (o.stage_design === 1 || o.workflow_status === "لغو / مرجوعی")) return false;
      else if (status_pill === "در مرحله چاپ و برش" && (o.stage_design === 0 || o.stage_ship === 1 || o.workflow_status === "لغو / مرجوعی")) return false;
      else if (status_pill === "ارسال و تحویل‌شده" && o.stage_ship !== 1) return false;
      else if (status_pill === "بدهکار (مانده‌دار)" && ((Number(o.remaining_amount) || 0) <= 0 || o.workflow_status === "لغو / مرجوعی")) return false;
      else if (status_pill === "لغو / مرجوعی" && o.workflow_status !== "لغو / مرجوعی") return false;

      if (nq) {
        const itemsTxt = (o.items || []).map(i => `${i.title} ${i.spec || ""}`).join(" ");
        const hay = normalizePersian(`${o.id} ${o.customer_name} ${o.phone} ${o.product_title} ${itemsTxt} ${o.tracking_code} ${o.notes} ${o.marketer_name}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }

  // ---- فاکتورها ----
  nextInvoiceNumber(invoiceType = "فاکتور فروش") {
    const base = this.getSettings().invoice_prefix || "INV-";
    const map = { "فاکتور فروش": base, "پیش‌فاکتور": "PF-", "فاکتور خرید": "PUR-", "برگشت از فروش": "SRT-", "برگشت از خرید": "PRT-" };
    const pref = map[invoiceType] || base;
    const yr = getTodayJalali().split("/")[0];
    return `${pref}${yr}-${1001 + this.data.invoices.length}`;
  }

  saveInvoice(inv) {
    const existing = this.data.invoices.find(x => x.invoice_number === inv.invoice_number);
    if (existing) {
      Object.assign(existing, inv, { updated_at: utcNowIso() });
    } else {
      this.data.invoices.unshift({ id: this._nextId("invoices"), sync_uuid: makeUuid(), updated_at: utcNowIso(), ...inv });
    }
    this.logAction("ذخیره فاکتور", inv.invoice_number, `${inv.invoice_type} | ${inv.customer_name}`);
  }

  cancelInvoice(id) {
    const inv = this.getInvoice(id);
    if (!inv) return;
    inv.status = "ابطال‌شده";
    inv.updated_at = utcNowIso();
    this.logAction("ابطال فاکتور", inv.invoice_number, inv.customer_name);
  }

  deleteInvoice(id) {
    const inv = this.getInvoice(id);
    this._recordDeletion("invoices", inv);
    this.data.invoices = this.data.invoices.filter(x => x.id !== Number(id));
    if (inv) this.logAction("حذف فاکتور", inv.invoice_number, inv.customer_name);
  }

  getInvoice(id) { return this.data.invoices.find(x => x.id === Number(id)) || null; }
  fetchInvoices() { return [...this.data.invoices]; }

  // ---- مالی و چک‌ها ----
  addPayment(d) {
    const id = this._nextId("payments");
    const amt = Number(d.amount) || 0;
    this.data.payments.unshift({
      id,
      sync_uuid: makeUuid(),
      updated_at: utcNowIso(),
      pay_date: d.pay_date || getTodayJalali(),
      direction: d.direction || "دریافت",
      party_name: d.party_name.trim(),
      order_id: d.order_id ? Number(d.order_id) : null,
      method: d.method || "کارت به کارت",
      amount: amt,
      ref_code: d.ref_code || "",
      notes: d.notes || ""
    });
    if (d.direction === "دریافت" && d.order_id) {
      const o = this.getOrder(d.order_id);
      if (o) {
        o.has_deposit = true;
        o.deposit_amount = (Number(o.deposit_amount) || 0) + amt;
        o.remaining_amount = Math.max(0, (Number(o.total_price) || 0) - o.deposit_amount);
      }
    }
    this.logAction("سند مالی", `${d.direction} | ${d.party_name}`, `${formatMoney(amt)} ت`);
    return id;
  }

  fetchPayments(direction = "همه", search = "") {
    const nq = normalizePersian(search);
    return this.data.payments.filter(p => {
      if (direction !== "همه" && p.direction !== direction) return false;
      if (nq && !normalizePersian(`${p.party_name} ${p.method} ${p.ref_code} ${p.notes}`).includes(nq)) return false;
      return true;
    });
  }

  deletePayment(id) {
    const p = this.data.payments.find(x => x.id === Number(id));
    this._recordDeletion("payments", p);
    this.data.payments = this.data.payments.filter(x => x.id !== Number(id));
    this._save();
  }

  addCheck(d) {
    const id = this._nextId("checks");
    this.data.checks.unshift({
      id,
      sync_uuid: makeUuid(),
      updated_at: utcNowIso(),
      direction: d.direction || "دریافتی",
      party_name: d.party_name.trim(),
      check_number: d.check_number.trim(),
      sayadi_id: d.sayadi_id || "",
      bank_name: d.bank_name || "",
      amount: Number(d.amount) || 0,
      issue_date: d.issue_date || getTodayJalali(),
      due_date: d.due_date.trim(),
      status: "در جریان",
      order_id: d.order_id ? Number(d.order_id) : null,
      notes: d.notes || ""
    });
    this.logAction("ثبت چک", d.check_number, `${d.party_name} | سررسید ${d.due_date}`);
    return id;
  }

  updateCheckStatus(id, newStatus) {
    const c = this.data.checks.find(x => x.id === Number(id));
    if (!c) return;
    const prev = c.status;
    c.status = newStatus;
    c.updated_at = utcNowIso();
    if (newStatus === "وصول شده" && prev !== "وصول شده" && c.direction === "دریافتی") {
      if (c.order_id) {
        const o = this.getOrder(c.order_id);
        if (o) {
          o.has_deposit = true;
          o.deposit_amount = (Number(o.deposit_amount) || 0) + Number(c.amount);
          o.remaining_amount = Math.max(0, (Number(o.total_price) || 0) - o.deposit_amount);
        }
      }
      this.data.payments.unshift({
        id: this._nextId("payments"),
        pay_date: getTodayJalali(), direction: "دریافت", party_name: c.party_name,
        order_id: c.order_id, method: "وصول چک", amount: Number(c.amount),
        ref_code: c.check_number, notes: `وصول چک ${c.bank_name} شماره ${c.check_number}`,
        sync_uuid: makeUuid(), updated_at: utcNowIso()
      });
    }
    this.logAction("تغییر وضعیت چک", c.check_number, newStatus);
  }

  fetchChecks(status = "همه", direction = "همه", search = "") {
    const nq = normalizePersian(search);
    return this.data.checks.filter(c => {
      if (status !== "همه" && c.status !== status) return false;
      if (direction !== "همه" && c.direction !== direction) return false;
      if (nq && !normalizePersian(`${c.party_name} ${c.check_number} ${c.sayadi_id} ${c.bank_name}`).includes(nq)) return false;
      return true;
    }).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  }

  deleteCheck(id) {
    const c = this.data.checks.find(x => x.id === Number(id));
    this._recordDeletion("checks", c);
    this.data.checks = this.data.checks.filter(x => x.id !== Number(id));
    this._save();
  }

  getPartyStatement(partyName) {
    const entries = [];
    for (const o of this.data.orders) {
      if (o.customer_name === partyName && o.workflow_status !== "لغو / مرجوعی") {
        entries.push({ date: o.order_date, desc: `سفارش #${o.id} — ${o.product_title}`, debit: Number(o.total_price) || 0, credit: 0 });
      }
    }
    for (const p of this.data.payments) {
      if (p.party_name === partyName) {
        if (p.direction === "دریافت") {
          entries.push({ date: p.pay_date, desc: `دریافت (${p.method}) ${p.notes || ""}`, debit: 0, credit: Number(p.amount) || 0 });
        } else {
          entries.push({ date: p.pay_date, desc: `پرداخت (${p.method}) ${p.notes || ""}`, debit: Number(p.amount) || 0, credit: 0 });
        }
      }
    }
    entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let bal = 0;
    for (const e of entries) {
      bal += e.debit - e.credit;
      e.balance = bal;
    }
    return entries;
  }

  // ---- داشبورد و گزارشات ----
  getDashboardStats() {
    const activeList = this.data.orders.filter(o => o.workflow_status !== "لغو / مرجوعی");
    let total_sales = 0, total_cogs = 0, total_design = 0, total_received = 0, total_remaining = 0;
    let st_receive = 0, st_approve = 0, st_print = 0, st_pack = 0, st_ship = 0, active_orders = 0;
    for (const o of activeList) {
      total_sales += Number(o.total_price) || 0;
      total_cogs += Number(o.total_cost) || 0;
      total_design += (Number(o.design_cost) || 0) + (Number(o.cliche_cost) || 0);
      total_received += Number(o.deposit_amount) || 0;
      total_remaining += Number(o.remaining_amount) || 0;
      const wf = o.workflow_status || "دریافت طرح";
      if (["پیش‌نویس", "دریافت طرح"].includes(wf)) st_receive++;
      else if (wf === "تأیید طرح") st_approve++;
      else if (["در حال چاپ", "برش و رول‌پیچی"].includes(wf)) st_print++;
      else if (wf === "بسته‌بندی") st_pack++;
      else if (o.stage_ship === 1 || ["ارسال شده", "تحویل شده"].includes(wf)) st_ship++;
      if (o.stage_ship === 0) active_orders++;
    }
    const low_stock_count = this.data.products.filter(p => (Number(p.stock_qty) || 0) <= (Number(p.min_stock) || 0)).length;
    const open_checks_count = this.data.checks.filter(c => c.status === "در جریان").length;
    return {
      total_orders: activeList.length,
      total_sales, total_cogs, total_design, total_received, total_remaining,
      gross_profit: total_sales - total_cogs,
      st_receive, st_approve, st_print, st_pack, st_ship, active_orders,
      low_stock_count, open_checks_count
    };
  }

  getSmartAlerts() {
    const alerts = [];
    for (const p of this.data.products.filter(x => (Number(x.stock_qty) || 0) <= (Number(x.min_stock) || 0)).slice(0, 6)) {
      const sp = p.size_spec ? ` (${p.size_spec})` : "";
      alerts.push({ kind: "low_stock", text: `کمبود موجودی: ${p.name}${sp} — موجودی: ${formatQty(p.stock_qty)} ${p.unit_main}` });
    }
    for (const c of this.data.checks.filter(x => x.status === "در جریان").slice(0, 5)) {
      alerts.push({ kind: "check", text: `چک ${c.direction}: ${c.party_name} — ${formatMoney(c.amount)} ت | سررسید ${c.due_date}` });
    }
    return alerts;
  }

  getMessengerBreakdown() {
    const map = {};
    for (const o of this.data.orders.filter(x => x.workflow_status !== "لغو / مرجوعی")) {
      const m = o.messenger || "سایر";
      if (!map[m]) map[m] = { messenger: m, cnt: 0, sales: 0 };
      map[m].cnt++;
      map[m].sales += Number(o.total_price) || 0;
    }
    return Object.values(map).sort((a, b) => b.sales - a.sales).slice(0, 6);
  }

  getUrgentOrders() {
    return this.data.orders
      .filter(o => o.workflow_status !== "لغو / مرجوعی" && (o.stage_ship === 0 || (Number(o.remaining_amount) || 0) > 0))
      .slice(0, 8);
  }

  getCustomersSummary(search = "") {
    const nq = normalizePersian(search);
    const map = {};
    for (const o of this.data.orders.filter(x => x.workflow_status !== "لغو / مرجوعی")) {
      const name = o.customer_name;
      if (!map[name]) {
        map[name] = { customer_name: name, phone: o.phone || "", messenger: o.messenger || "", order_count: 0, total_spent: 0, total_paid: 0, total_debt: 0 };
      }
      map[name].order_count++;
      map[name].total_spent += Number(o.total_price) || 0;
      map[name].total_paid += Number(o.deposit_amount) || 0;
      map[name].total_debt += Number(o.remaining_amount) || 0;
      if (!map[name].phone && o.phone) map[name].phone = o.phone;
    }
    return Object.values(map)
      .filter(c => !nq || normalizePersian(`${c.customer_name} ${c.phone}`).includes(nq))
      .sort((a, b) => b.total_spent - a.total_spent);
  }

  getProfitLossReport(dateFrom = "", dateTo = "") {
    const rows = this.data.orders.filter(o => {
      if (o.workflow_status === "لغو / مرجوعی") return false;
      if (dateFrom && o.order_date < dateFrom) return false;
      if (dateTo && o.order_date > dateTo) return false;
      return true;
    });
    const total_sales = rows.reduce((s, r) => s + (Number(r.total_price) || 0), 0);
    const total_cogs = rows.reduce((s, r) => s + (Number(r.total_cost) || 0), 0);
    const total_design = rows.reduce((s, r) => s + (Number(r.design_cost) || 0) + (Number(r.cliche_cost) || 0), 0);
    const total_discount = rows.reduce((s, r) => s + (Number(r.discount) || 0), 0);
    return { order_count: rows.length, total_sales, total_cogs, gross_profit: total_sales - total_cogs, total_design, total_discount };
  }

  getTopSellingReport(dateFrom = "", dateTo = "") {
    const agg = {};
    for (const o of this.data.orders) {
      if (o.workflow_status === "لغو / مرجوعی") continue;
      if (dateFrom && o.order_date < dateFrom) continue;
      if (dateTo && o.order_date > dateTo) continue;
      for (const it of o.items || []) {
        const key = `${it.title}||${it.spec || ""}||${it.unit || "عدد"}`;
        if (!agg[key]) agg[key] = { title: it.title, spec: it.spec || "", unit: it.unit || "عدد", qty: 0, revenue: 0, cost: 0, orders: 0 };
        agg[key].qty += Number(it.quantity) || 0;
        agg[key].revenue += Number(it.total) || 0;
        agg[key].cost += (Number(it.cost_price) || 0) * (Number(it.quantity) || 0);
        agg[key].orders++;
      }
    }
    return Object.values(agg).map(x => ({ ...x, profit: x.revenue - x.cost })).sort((a, b) => b.revenue - a.revenue);
  }

  getDeadStockReport() {
    const soldIds = new Set(this.data.stock_movements.filter(m => m.qty_change < 0).map(m => m.product_id));
    return this.data.products.filter(p => (Number(p.stock_qty) || 0) > 0 && !soldIds.has(p.id));
  }

  getVatReport(dateFrom = "", dateTo = "") {
    return this.data.invoices.filter(inv => {
      if (inv.status !== "فعال") return false;
      if (dateFrom && inv.invoice_date < dateFrom) return false;
      if (dateTo && inv.invoice_date > dateTo) return false;
      return true;
    });
  }

  getMarketerReport() {
    const map = {};
    for (const o of this.data.orders) {
      if (o.workflow_status === "لغو / مرجوعی" || !o.marketer_name) continue;
      const mk = o.marketer_name.trim();
      if (!map[mk]) {
        const party = this.data.parties.find(p => p.name === mk && p.party_type === "بازاریاب");
        map[mk] = { marketer_name: mk, cnt: 0, sales: 0, comm_pct: party ? (Number(party.commission_percent) || 0) : 0 };
      }
      map[mk].cnt++;
      map[mk].sales += Number(o.total_price) || 0;
    }
    return Object.values(map).sort((a, b) => b.sales - a.sales);
  }

  globalSearch(query = "") {
    const nq = normalizePersian(query);
    const out = [];
    for (const o of this.data.orders) {
      if (!nq || normalizePersian(`${o.id} ${o.customer_name} ${o.product_title} ${o.phone} ${o.tracking_code}`).includes(nq)) {
        out.push({ kind: "order", id: o.id, label: `📦 سفارش #${o.id} — ${o.customer_name} (${formatMoney(o.total_price)} ت)` });
      }
      if (out.length >= 6) break;
    }
    let pc = 0;
    for (const p of this.data.products) {
      if (!nq || normalizePersian(`${p.name} ${p.sku} ${p.barcode} ${p.size_spec} ${p.material}`).includes(nq)) {
        out.push({ kind: "product", id: p.id, label: `🏷️ کالا ${p.sku} — ${p.name} (موجودی: ${formatQty(p.stock_qty)})` });
        if (++pc >= 6) break;
      }
    }
    let cc = 0;
    for (const c of this.data.parties) {
      if (!nq || normalizePersian(`${c.name} ${c.phone}`).includes(nq)) {
        out.push({ kind: "customer", id: c.name, label: `👤 ${c.party_type}: ${c.name} (${c.phone || "-"})` });
        if (++cc >= 4) break;
      }
    }
    let ic = 0;
    for (const inv of this.data.invoices) {
      if (!nq || normalizePersian(`${inv.invoice_number} ${inv.customer_name}`).includes(nq)) {
        out.push({ kind: "invoice", id: inv.id, label: `🧾 ${inv.invoice_type} ${inv.invoice_number} — ${inv.customer_name}` });
        if (++ic >= 4) break;
      }
    }
    return out;
  }

  exportBackupJson() {
    return JSON.stringify({ app: "ModiriatSefareshPro", version: APP_VERSION, exported_at: getNowJalaliStr(), data: this.data }, null, 2);
  }

  importBackupJson(jsonText) {
    const parsed = JSON.parse(jsonText);
    const payload = parsed.data ? parsed.data : parsed;
    if (!payload || !Array.isArray(payload.orders) || !Array.isArray(payload.products)) {
      throw new Error("فرمت فایل پشتیبان معتبر نیست.");
    }
    this.data = payload;
    this._ensureSchema();
    this.logAction("بازیابی پشتیبان", "فایل JSON", "اطلاعات با موفقیت بازیابی شد");
  }

  // ---- همگام‌سازی ابری با سرور مرکزی (سازگار با نسخه ویندوز) ----
  buildSyncPayload(fullPush = false) {
    const s = this.getSettings();
    const lastSync = fullPush ? "" : (s.cloud_last_sync_at || "").trim();
    const tables = ["warehouses", "products", "stock_movements", "parties", "orders", "invoices", "payments", "checks"];
    const changes = {};

    const prodMap = new Map(this.data.products.map(p => [p.id, { uuid: p.sync_uuid, sku: p.sku }]));
    const ordMap = new Map(this.data.orders.map(o => [o.id, o.sync_uuid]));

    for (const tbl of tables) {
      const rows = (this.data[tbl] || []).filter(r => !lastSync || (r.updated_at || "") > lastSync);
      changes[tbl] = rows.map(r => {
        const copy = { ...r };
        delete copy.id;
        if (tbl === "orders" || tbl === "invoices") {
          copy.items_json = JSON.stringify(copy.items || []);
          delete copy.items;
        } else if (tbl === "stock_movements") {
          const pm = prodMap.get(copy.product_id) || { uuid: "", sku: "" };
          copy.product_uuid = pm.uuid;
          copy.product_sku = pm.sku;
        } else if (tbl === "payments" || tbl === "checks") {
          copy.order_uuid = ordMap.get(copy.order_id) || "";
        }
        return copy;
      });
    }

    const deleted = (this.data.sync_deletions || []).filter(d => !lastSync || (d.deleted_at || "") > lastSync);
    const sharedKeys = [
      "brand_name", "brand_slogan", "brand_phone", "brand_address", "brand_social",
      "seller_economic_code", "seller_national_id", "fiscal_year", "default_tax_percent",
      "bank_card", "bank_owner", "invoice_prefix", "invoice_accent", "invoice_footer"
    ];
    const sharedSettings = {};
    for (const k of sharedKeys) {
      if (s[k]) sharedSettings[k] = s[k];
    }

    return {
      device_id: s.cloud_device_id || "android-device",
      last_sync_at: lastSync,
      changes,
      deleted,
      settings: sharedSettings
    };
  }

  applySyncResponse(respData) {
    const updates = respData.updates || {};
    const deletions = respData.deletions || [];
    const remoteSettings = respData.settings || {};
    const serverTime = respData.server_time || utcNowIso();
    let hadChanges = false;

    const naturalKeys = { warehouses: "name", products: "sku", parties: "name", invoices: "invoice_number" };

    // 1. اعمال حذف‌ها
    for (const d of deletions) {
      const tbl = d.table;
      const suid = (d.sync_uuid || "").trim();
      if (Array.isArray(this.data[tbl]) && suid) {
        const before = this.data[tbl].length;
        this.data[tbl] = this.data[tbl].filter(x => x.sync_uuid !== suid);
        if (this.data[tbl].length !== before) hadChanges = true;
      }
    }

    const prodByUuid = new Map(this.data.products.map(p => [p.sync_uuid, p.id]));
    const prodBySku = new Map(this.data.products.map(p => [p.sku, p.id]));
    const ordByUuid = new Map(this.data.orders.map(o => [o.sync_uuid, o.id]));

    const numFields = new Set([
      "conversion_factor", "labels_per_roll", "roll_meters", "stock_qty", "reserved_qty",
      "min_stock", "max_stock", "cost_price", "retail_price", "wholesale_price", "partner_price",
      "tier1_min_qty", "tier1_price", "tier2_min_qty", "tier2_price", "tax_rate",
      "qty_change", "waste_qty", "unit_cost", "credit_limit", "commission_percent",
      "quantity", "unit_price", "design_cost", "cliche_cost", "packaging_cost",
      "discount", "shipping_cost", "total_price", "total_cost", "deposit_amount",
      "remaining_amount", "stage_design", "stage_print", "stage_ship",
      "subtotal", "tax_percent", "tax_amount", "grand_total", "paid_amount", "amount"
    ]);

    const order = ["warehouses", "products", "parties", "orders", "invoices", "stock_movements", "payments", "checks"];
    for (const tbl of order) {
      const rows = updates[tbl] || [];
      if (!rows.length) continue;
      const natCol = naturalKeys[tbl];

      for (const r of rows) {
        const suid = String(r.sync_uuid || "").trim();
        if (!suid) continue;
        const inUpd = String(r.updated_at || "");

        let existing = this.data[tbl].find(x => x.sync_uuid === suid);
        if (!existing && natCol && r[natCol]) {
          existing = this.data[tbl].find(x => x[natCol] === r[natCol]);
        }
        if (existing && String(existing.updated_at || "") >= inUpd) continue;

        const clean = { ...r, sync_uuid: suid, updated_at: inUpd || serverTime };
        delete clean.id;
        for (const k of Object.keys(clean)) {
          if (numFields.has(k)) clean[k] = Number(clean[k]) || 0;
        }
        if (tbl === "orders" || tbl === "invoices") {
          try {
            clean.items = typeof clean.items_json === "string" && clean.items_json ? JSON.parse(clean.items_json) : (Array.isArray(clean.items) ? clean.items : []);
          } catch (e) { clean.items = []; }
          delete clean.items_json;
          if (tbl === "orders") {
            clean.has_deposit = Boolean(Number(clean.has_deposit) || clean.deposit_amount > 0);
            clean.stock_deducted = Boolean(Number(clean.stock_deducted));
          }
        } else if (tbl === "stock_movements") {
          const pid = prodByUuid.get(r.product_uuid) || prodBySku.get(r.product_sku);
          if (!pid) continue;
          clean.product_id = pid;
        } else if (tbl === "payments" || tbl === "checks") {
          clean.order_id = ordByUuid.get(r.order_uuid) || null;
        }

        if (existing) {
          Object.assign(existing, clean);
        } else {
          const newId = this._nextId(tbl);
          this.data[tbl].unshift({ id: newId, ...clean });
          if (tbl === "products") {
            prodByUuid.set(suid, newId);
            if (clean.sku) prodBySku.set(clean.sku, newId);
          } else if (tbl === "orders") {
            ordByUuid.set(suid, newId);
          }
        }
        hadChanges = true;
      }
    }

    const allowedShared = new Set([
      "brand_name", "brand_slogan", "brand_phone", "brand_address", "brand_social",
      "seller_economic_code", "seller_national_id", "fiscal_year", "default_tax_percent",
      "bank_card", "bank_owner", "invoice_prefix", "invoice_accent", "invoice_footer"
    ]);
    for (const [k, v] of Object.entries(remoteSettings)) {
      if (allowedShared.has(k) && v !== null && v !== undefined) {
        this.data.settings[k] = String(v);
      }
    }
    this.data.settings.cloud_last_sync_at = serverTime;
    this._save();
    return hadChanges;
  }
}

const DB = new AppStore();

