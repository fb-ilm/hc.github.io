/**
 * Frontend - Vista Móvil / Handheld para Recolección en Piso
 * Archivo: js/views/mobile_picker.js
 */

const MobilePickerView = (function () {
  let currentUser = localStorage.getItem("session_picker_user") || "";
  let selectedOrders = [];
  let currentPickIndex = 0;
  let searchFilterQuery = "";

  function getContainer() {
    return document.getElementById("picker-view") || document.getElementById("main-content");
  }

  function render(container) {
    const targetContainer = container || getContainer();
    if (!currentUser) {
      renderLogin(targetContainer);
    } else {
      renderMainPicker(targetContainer);
    }
  }

  function renderLogin(container) {
    const target = container || getContainer();
    target.innerHTML = `
      <div style="max-width: 420px; margin: 30px auto; padding: 20px; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <h3 style="color: #0f172a; margin-top: 0;">📦 Recolección Handheld</h3>
        <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 20px;">Ingresa tu número de empleado para iniciar turno (Ej: 012345A)</p>
        
        <form onsubmit="MobilePickerView.handleLogin(event); return false;">
          <input type="text" id="input-employee-id" class="form-control" placeholder="0#####A" autofocus required 
            style="font-size: 1.3rem; text-align: center; font-family: monospace; text-transform: uppercase; margin-bottom: 16px; height: 48px; border: 2px solid #2563eb;">
          <button type="submit" class="btn btn-primary btn-block" style="height: 48px; font-weight: bold; font-size: 1rem;">
            🚀 Iniciar Recolección
          </button>
        </form>
      </div>
    `;

    setTimeout(() => {
      const input = document.getElementById("input-employee-id");
      if (input) input.focus();
    }, 100);
  }

  async function handleLogin(e) {
    if (e) e.preventDefault();
    const inputEl = document.getElementById("input-employee-id");
    if (!inputEl) return;

    const input = inputEl.value.trim().toUpperCase();
    const regex = /^0\d{5}[A-Z]$/;

    if (!regex.test(input)) {
      App.showToast("Formato inválido. Debe ser 0#####A (Ej: 012345A).", "error");
      return;
    }

    currentUser = input;
    localStorage.setItem("session_picker_user", currentUser);
    App.showToast(`Sesión iniciada: ${currentUser}`, "success");

    App.showLoader("Cargando datos de recolección...");
    if (typeof App.refreshDatabase === "function") {
      await App.refreshDatabase();
    }
    App.hideLoader();

    if (typeof App.switchView === "function") {
      App.switchView("picker-view");
    }

    render(getContainer());
  }

  function logout() {
    localStorage.removeItem("session_picker_user");
    currentUser = "";
    selectedOrders = [];
    searchFilterQuery = "";
    App.showToast("Sesión del recolector cerrada.", "info");

    if (typeof App.switchView === "function") {
      App.switchView("picker-view");
    }

    render(getContainer());
  }

  function renderMainPicker(container) {
    const target = container || getContainer();
    target.innerHTML = `
      <div style="max-width: 480px; margin: 0 auto; padding-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; color: #fff; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px;">
          <div>
            <span style="font-size: 0.75rem; color: #94a3b8;">RECOLECTOR:</span>
            <span style="font-family: monospace; font-weight: bold; color: #38bdf8; margin-left: 4px;">${currentUser}</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger" style="color: #fff; border-color: #ef4444;" onclick="MobilePickerView.logout()">Salir</button>
        </div>

        <div class="card" style="padding: 14px; margin-bottom: 12px; background: #fff; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; font-size: 1rem;">Ruta de Recolección</h3>
            <span id="lbl-cart-badge" class="badge" style="background: #2563eb; color: #fff; font-size: 0.85rem; padding: 4px 10px; border-radius: 12px;">
              ${selectedOrders.length} / 5
            </span>
          </div>

          <form onsubmit="MobilePickerView.handleSearchSubmit(event); return false;" style="display: flex; gap: 6px;">
            <input type="text" id="input-search-mobile" class="form-control" 
              placeholder="Escribe o escanea ORDER_ID..." 
              value="${searchFilterQuery}"
              oninput="MobilePickerView.onSearchInput(this.value)"
              style="font-family: monospace; font-size: 0.95rem;">
            <button type="submit" class="btn btn-primary" style="font-weight: bold;">Filtrar</button>
            <button type="button" id="btn-clear-search" class="btn btn-outline-secondary" onclick="MobilePickerView.clearSearch()" style="display: ${searchFilterQuery ? 'inline-block' : 'none'};">✕</button>
          </form>
        </div>

        <div id="container-active-groups"></div>

        <div style="position: sticky; bottom: 10px; margin-top: 16px;">
          <button type="button" id="btn-start-route-action" class="btn btn-success btn-block" style="height: 48px; font-size: 1rem; font-weight: bold;" 
            onclick="MobilePickerView.startRoute()" ${selectedOrders.length === 0 ? 'disabled' : ''}>
            🗺️ Iniciar Recolección (${selectedOrders.length})
          </button>
        </div>
      </div>
    `;

    renderCardsOnly();
  }

  // 1. DIBUJO DE TARJETAS CON BUSQUEDA DE MEDIDAS REALES DEL PADRE EN tbInventario
  function renderCardsOnly() {
    const container = document.getElementById("container-active-groups");
    const cartBadge = document.getElementById("lbl-cart-badge");
    const startBtn = document.getElementById("btn-start-route-action");
    const clearBtn = document.getElementById("btn-clear-search");

    if (cartBadge) cartBadge.innerText = `${selectedOrders.length} / 5`;
    if (startBtn) {
      startBtn.disabled = selectedOrders.length === 0;
      startBtn.innerText = `🗺️ Iniciar Recolección (${selectedOrders.length})`;
    }
    if (clearBtn) clearBtn.style.display = searchFilterQuery ? 'inline-block' : 'none';

    if (!container) return;

    const pickerAssignments = App.getDbTable("tbPickers") || [];
    const inventory = App.getDbTable("tbInventario") || [];

    const myAssignments = pickerAssignments.filter(a => 
      String(a.OPERATOR_ID || a.operatorId || "").trim().toUpperCase() === String(currentUser).trim().toUpperCase() &&
      String(a.STATUS || a.status || "").trim().toUpperCase() === "PENDIENTE"
    );

    const groupsMap = {};
    myAssignments.forEach(a => {
      const parentId = String(a.MATERIAL_ID || a.materialId).trim();
      
      if (!groupsMap[parentId]) {
        // BUSCAR MEDIDAS REALES DEL SOBRANTE PADRE EN INVENTARIO
        const invMatch = inventory.find(i => String(i.MATERIAL_ID || i.materialId || "").trim() === parentId);
        
        const realWidth = invMatch ? Number(invMatch.WIDTH || invMatch.width || 0) : Number(a.PARENT_WIDTH || a.MAT_WIDTH || 0);
        const realCells = invMatch ? Number(invMatch.CELLS || invMatch.cells || 0) : Number(a.PARENT_CELLS || a.MAT_CELLS || 0);

        groupsMap[parentId] = {
          parentMaterialId: parentId,
          rack: a.RACK || 'N/A',
          loc: a.LOC || 'N/A',
          pcnId: a.PCN_ID || a.pcnId,
          parentWidth: realWidth,
          parentCells: realCells,
          orders: []
        };
      }
      groupsMap[parentId].orders.push(a);
    });

    let groupsList = Object.values(groupsMap);

    if (searchFilterQuery) {
      const cleanQuery = searchFilterQuery.toLowerCase();
      groupsList = groupsList.filter(g => {
        const matchParent = g.parentMaterialId.toLowerCase().includes(cleanQuery);
        const matchPcn = String(g.pcnId || "").toLowerCase().includes(cleanQuery);
        const matchOrder = g.orders.some(o => String(o.ORDER_ID || o.orderId || "").toLowerCase().includes(cleanQuery));
        return matchParent || matchPcn || matchOrder;
      });
    }

    if (groupsList.length === 0) {
      container.innerHTML = `<p style="color: #64748b; text-align: center; padding: 30px; background: #fff; border-radius: 6px; border: 1px solid #e2e8f0;">
        ${searchFilterQuery ? `No se encontraron sobrantes que contengan "${searchFilterQuery}".` : 'No tienes rutas de recolección asignadas por el optimizador.'}
      </p>`;
      return;
    }

    let cardsHtml = "";
    groupsList.forEach(g => {
      const isSelected = selectedOrders.some(s => s.parentMaterialId === g.parentMaterialId);
      const cardStyle = isSelected 
        ? "border: 2px solid #2563eb; background: #eff6ff;" 
        : "border: 1px solid #cbd5e1; background: #ffffff;";

      let ordersDetailHtml = "";
      g.orders.forEach(o => {
        const ordId = String(o.ORDER_ID || o.orderId || "");
        const isHighlighted = searchFilterQuery && ordId.toLowerCase().includes(searchFilterQuery.toLowerCase());
        const highlightStyle = isHighlighted ? "background: #fef08a; font-weight: bold; color: #854d0e; padding: 1px 4px; border-radius: 2px;" : "";

        ordersDetailHtml += `<li style="font-family: monospace; font-size: 0.82rem; margin-top: 2px;">
          <span style="${highlightStyle}">${ordId}</span> (${o.WIDTH || o.width}W x ${o.CELLS || o.cells}C)
        </li>`;
      });

      cardsHtml += `
        <div class="card" style="padding: 12px; margin-bottom: 10px; border-radius: 8px; ${cardStyle}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-family: monospace; font-size: 0.95rem; color: #1e293b;">PADRE: ${g.parentMaterialId}</strong>
            <span class="badge" style="background: #0284c7; color: #fff; font-size: 0.8rem; padding: 4px 8px;">
              📍 ${g.rack}-${g.loc}
            </span>
          </div>

          <!-- MUESTRA MEDIDAS REALES OBTENIDAS DE INVENTARIO -->
          <div style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; color: #0f172a; font-weight: bold; margin-bottom: 8px; display: inline-block;">
            📏 Medidas Padre: <span style="color: #2563eb;">${g.parentWidth}W x ${g.parentCells}C</span>
          </div>

          <div style="font-size: 0.8rem; color: #475569; margin-bottom: 4px;">
            <b>PCN:</b> ${g.pcnId} | <b>Órdenes (${g.orders.length}):</b>
          </div>
          <ul style="margin: 0 0 10px 18px; padding: 0; color: #334155;">
            ${ordersDetailHtml}
          </ul>
          <button type="button" class="btn ${isSelected ? 'btn-danger' : 'btn-primary'} btn-block" style="font-weight: bold; height: 40px;" 
            onclick="MobilePickerView.toggleSelectGroup('${g.parentMaterialId}')">
            ${isSelected ? '❌ Quitar de la lista' : '➕ Seleccionar Sobrante'}
          </button>
        </div>`;
    });

    container.innerHTML = cardsHtml;
  }

  function onSearchInput(val) {
    searchFilterQuery = String(val || "").trim();
    renderCardsOnly();
  }

  function handleSearchSubmit(e) {
    if (e) e.preventDefault();
    const inputEl = document.getElementById("input-search-mobile");
    if (inputEl) {
      searchFilterQuery = inputEl.value.trim();
      renderCardsOnly();
    }
  }

  function clearSearch() {
    searchFilterQuery = "";
    const inputEl = document.getElementById("input-search-mobile");
    if (inputEl) inputEl.value = "";
    renderCardsOnly();
  }

  function toggleSelectGroup(parentMaterialId) {
    const idx = selectedOrders.findIndex(s => s.parentMaterialId === parentMaterialId);
    
    if (idx !== -1) {
      selectedOrders.splice(idx, 1);
    } else {
      if (selectedOrders.length >= 5) {
        App.showToast("Máximo 5 sobrantes padre por ruta de recolección.", "warning");
        return;
      }

      const pickerAssignments = App.getDbTable("tbPickers") || [];
      const inventory = App.getDbTable("tbInventario") || [];

      const groupOrders = pickerAssignments.filter(a => 
        String(a.OPERATOR_ID || a.operatorId || "").trim().toUpperCase() === String(currentUser).trim().toUpperCase() &&
        String(a.MATERIAL_ID || a.materialId || "").trim() === String(parentMaterialId).trim() &&
        String(a.STATUS || a.status || "").trim().toUpperCase() === "PENDIENTE"
      );

      if (groupOrders.length > 0) {
        const first = groupOrders[0];
        const invMatch = inventory.find(i => String(i.MATERIAL_ID || i.materialId || "").trim() === String(parentMaterialId).trim());

        const realWidth = invMatch ? Number(invMatch.WIDTH || invMatch.width || 0) : Number(first.PARENT_WIDTH || 0);
        const realCells = invMatch ? Number(invMatch.CELLS || invMatch.cells || 0) : Number(first.PARENT_CELLS || 0);

        selectedOrders.push({
          parentMaterialId: parentMaterialId,
          rack: first.RACK || first.rack || 'N/A',
          loc: first.LOC || first.loc || 'N/A',
          pcnId: first.PCN_ID || first.pcnId || 'N/A',
          parentWidth: realWidth,
          parentCells: realCells,
          orders: groupOrders
        });
      } else {
        App.showToast("No se encontraron órdenes pendientes para este sobrante.", "error");
        return;
      }
    }

    renderCardsOnly();
  }

  function goBackToMenu() {
    renderMainPicker(getContainer());
  }

  function startRoute() {
    if (selectedOrders.length === 0) {
      App.showToast("Selecciona al menos un sobrante padre para iniciar.", "warning");
      return;
    }
    currentPickIndex = 0;
    renderPickCard(getContainer());
  }

  // 2. LECTURA DIRECTA DE LAYOUT_TYPE DESDE tbAsignaciones
  function renderPickCard(container) {
    const target = container || getContainer();
    const current = selectedOrders[currentPickIndex];

    if (!current) {
      renderMainPicker(target);
      return;
    }

    const parentMatIdStr = String(current.parentMaterialId).trim();

    // 1. LEER REMANENTES RESULTANTES (SUB-SOBRANTES)
    const allSubSobrantes = App.getDbTable("tbSobrantesResultantes") || [];
    const matchedSubRems = allSubSobrantes.filter(s => {
      const pKey = String(s.PARENT_MATERIAL_ID || s.parentMaterialId || s.MATERIAL_PADRE || s.parent_material_id || "").trim();
      return pKey === parentMatIdStr;
    });

    const subLateral = matchedSubRems.find(s => String(s.TYPE || s.type || "").trim().toUpperCase() === 'LATERAL');
    const subBottom = matchedSubRems.find(s => String(s.TYPE || s.type || "").trim().toUpperCase() === 'BOTTOM');

    // 2. RECUPERAR Y LIMPIAR LAYOUT_TYPE EXPLICITAMENTE DESDE TODAS LAS FUENTES POSIBLES
    const allAssignments = App.getDbTable("tbAsignaciones") || [];
    const firstOrd = current.orders[0] || {};
    const firstOrdId = String(firstOrd.ORDER_ID || firstOrd.orderId || "").trim();

    // Búsqueda en tbAsignaciones por ORDER_ID o por MATERIAL_ID
    const asigMatch = allAssignments.find(a => 
      String(a.ORDER_ID || a.orderId || "").trim() === firstOrdId ||
      String(a.MATERIAL_ID || a.materialId || "").trim() === parentMatIdStr
    );

    // Extraer cualquier variante de la clave LAYOUT_TYPE y limpiar espacios/caracteres
    const rawLayoutVal = String(
      asigMatch?.LAYOUT_TYPE || asigMatch?.layoutType || asigMatch?.layout_type ||
      firstOrd.LAYOUT_TYPE || firstOrd.layoutType || firstOrd.layout_type || 
      current.layoutType || ""
    ).trim().toUpperCase();

    // Evaluador estricto: Si contiene "VERT", "COL" o es "CELLS" -> Es VERTICAL (column)
    let isVertical = rawLayoutVal.includes("VERT") || rawLayoutVal.includes("COL") || rawLayoutVal === "CELLS";

    // RESPALDO DE SEGURIDAD GEOMÉTRICO (Si LAYOUT_TYPE venía vacío en la BD):
    // Si no hay layout explícito pero existe un sobrante resultarte BOTTOM (y no LATERAL), obligatoriamente es VERTICAL.
    if (!rawLayoutVal && subBottom && !subLateral) {
      isVertical = true;
    }

    // 3. CÁLCULOS DE PIEZAS Y CONSTRUCCIÓN DE ÓRDENES
    const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];
    const sumW = current.orders.reduce((sum, o) => sum + Number(o.WIDTH || o.width || 0), 0);
    const sumC = current.orders.reduce((sum, o) => sum + Number(o.CELLS || o.cells || 0), 0);

    let ordersListHtml = "";
    let ordersPiecesHtml = "";

    current.orders.forEach((o, idx) => {
      const ordId = o.ORDER_ID || o.orderId || "N/A";
      const w = Number(o.WIDTH || o.width || 0);
      const c = Number(o.CELLS || o.cells || 0);
      const bg = colors[idx % colors.length];

      ordersListHtml += `<li style="font-family: monospace; font-size: 0.85rem;"><b>${ordId}</b> (${w}W x ${c}C)</li>`;

      // Si es VERTICAL calcula por Celdas (C); si es HORIZONTAL calcula por Ancho (W)
      const pieceDimension = isVertical ? c : w;
      const totalDimension = isVertical ? (sumC || 1) : (sumW || 1);
      const pct = (pieceDimension / totalDimension) * 100 || 0;
      
      const pieceStyle = isVertical 
        ? `width: 100%; height: ${pct}%;` 
        : `width: ${pct}%; height: 100%;`;

      ordersPiecesHtml += `
        <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.72rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; border-radius: 2px; overflow: hidden; box-sizing: border-box;" title="${ordId}">
          <span><b>${ordId}</b></span>
          <span style="font-size: 0.65rem; opacity: 0.9;">${w}W x ${c}C</span>
        </div>`;
    });

    const topBlockHeight = subBottom ? "70%" : "100%";
    const ordersColWidth = subLateral ? "65%" : "100%";

    let layoutGraphicHtml = `
      <div style="position: relative; width: 100%; height: 170px; background: #0f172a; border: 2px solid #475569; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; padding: 4px; gap: 4px; box-sizing: border-box;">
        
        <!-- BLOQUE SUPERIOR DE ÓRDENES -->
        <div style="display: flex; width: 100%; height: ${topBlockHeight}; gap: 4px; overflow: hidden;">
          
          <div style="width: ${ordersColWidth}; height: 100%; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; gap: 2px;">
            ${ordersPiecesHtml}
          </div>`;

    if (subLateral) {
      const subId = subLateral.SUB_MATERIAL_ID || subLateral.subMaterialId || "SUB-LATERAL";
      const w = subLateral.WIDTH || subLateral.width || 0;
      const c = subLateral.CELLS || subLateral.cells || 0;

      layoutGraphicHtml += `
        <div style="width: 35%; height: 100%; background: #1e293b; border: 2px dashed #38bdf8; border-radius: 4px; color: #ffffff; font-size: 0.75rem; font-weight: bold; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 2px; box-sizing: border-box;" title="Sobrante Resultante LATERAL: ${subId}">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.75rem;">✂️ ${subId}</span>
          <span style="font-size: 0.68rem; color: #cbd5e1; margin-top: 2px;">LATERAL<br>${w}W x ${c}C</span>
        </div>`;
    }

    layoutGraphicHtml += `</div>`; // FIN BLOQUE SUPERIOR

    if (subBottom) {
      const subId = subBottom.SUB_MATERIAL_ID || subBottom.subMaterialId || "SUB-BOTTOM";
      const w = subBottom.WIDTH || subBottom.width || 0;
      const c = subBottom.CELLS || subBottom.cells || 0;

      layoutGraphicHtml += `
        <div style="width: 100%; height: 30%; background: #1e293b; border: 2px dashed #38bdf8; border-radius: 4px; color: #ffffff; font-size: 0.75rem; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 8px; box-sizing: border-box;" title="Sobrante Resultante BOTTOM: ${subId}">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.75rem;">✂️ ${subId} (BOTTOM)</span>
          <span style="font-size: 0.68rem; color: #cbd5e1;">(${w}W x ${c}C)</span>
        </div>`;
    }

    layoutGraphicHtml += `</div>`;

    target.innerHTML = `
      <div style="max-width: 480px; margin: 0 auto; padding-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="MobilePickerView.goBackToMenu()">← Volver</button>
          <span style="font-size: 0.85rem; font-weight: bold; color: #64748b;">Material ${currentPickIndex + 1} de ${selectedOrders.length}</span>
        </div>

        <div class="card" style="padding: 16px; background: #fff; border-radius: 8px; border: 2px solid #2563eb; text-align: center; margin-bottom: 12px;">
          <span style="font-size: 0.8rem; font-weight: bold; color: #64748b; text-transform: uppercase;">UBICACIÓN FÍSICA RACK</span>
          <h1 style="margin: 4px 0 10px 0; color: #2563eb; font-size: 2.2rem;">📍 ${current.rack} - ${current.loc}</h1>
          <hr style="margin: 10px 0;">

          <!-- MUESTRA DE DATOS Y MEDIDAS REALES DEL PADRE -->
          <div style="font-size: 0.9rem; text-align: left; color: #334155; margin-bottom: 12px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span><b>Sobrante Padre:</b> <span style="font-family: monospace; color: #2563eb; font-weight: bold;">${current.parentMaterialId}</span></span>
              <span style="background: #2563eb; color: #fff; font-size: 0.78rem; font-weight: bold; padding: 2px 8px; border-radius: 4px;">
                📏 ${current.parentWidth}W x ${current.parentCells}C
              </span>
            </div>
            <div><b>PCN:</b> ${current.pcnId}</div>
          </div>

          <div style="margin-bottom: 14px; text-align: left;">
            <strong style="font-size: 0.8rem; color: #0f172a; display: block; margin-bottom: 4px;">📐 Diagrama del Sobrante (Órdenes + Nuevos Sobrantes):</strong>
            ${layoutGraphicHtml}
          </div>

          <div style="background: #f8fafc; padding: 10px; border-radius: 6px; text-align: left; margin-bottom: 16px; border: 1px solid #e2e8f0;">
            <strong style="font-size: 0.8rem; color: #16a34a;">Órdenes en este Remanente:</strong>
            <ul style="margin: 4px 0 0 16px; padding: 0; color: #475569;">${ordersListHtml}</ul>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="font-size: 0.85rem; font-weight: bold; color: #0f172a; display: block; margin-bottom: 4px;">ESCANEAR MATERIAL PARA TOMAR:</label>
            <input type="text" id="input-pick-scan" placeholder="Escanea código de barras..." 
              onchange="MobilePickerView.verifyPickScan(this.value)" autofocus
              style="width: 100%; height: 48px; font-size: 1.1rem; text-align: center; font-family: monospace; border: 2px solid #2563eb; border-radius: 6px;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button type="button" class="btn btn-warning" style="height: 44px; font-weight: bold;" onclick="MobilePickerView.reportIssue('MATERIAL_DANADO')">
              ⚠️ Dañado
            </button>
            <button type="button" class="btn btn-danger" style="height: 44px; font-weight: bold;" onclick="MobilePickerView.reportIssue('MATERIAL_AUSENTE')">
              ❌ Ausente
            </button>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const input = document.getElementById("input-pick-scan");
      if (input) input.focus();
    }, 100);
  }

  async function verifyPickScan(scannedCode) {
    const current = selectedOrders[currentPickIndex];
    const scannedClean = String(scannedCode).trim();

    if (scannedClean === String(current.parentMaterialId).trim()) {
      App.showLoader("⏳ Registrando recolección en servidor...");

      try {
        const res = await GasAPI.send("markAssignmentAsTaken", { parentMaterialId: current.parentMaterialId });

        if (res && res.success) {
          App.showToast(`✅ Material ${current.parentMaterialId} marcado como TOMADO!`, "success");
          
          const dbPickers = App.getDbTable("tbPickers") || [];
          dbPickers.forEach(a => {
            if (String(a.MATERIAL_ID || a.materialId).trim() === current.parentMaterialId) {
              a.STATUS = "TOMADO";
            }
          });

          const printerIp = localStorage.getItem("cutter_printer_ip");
          if (printerIp) {
            GasAPI.send("printZplDirectToIP", {
              printerIp: printerIp,
              subId: current.parentMaterialId,
              pcn: current.pcnId
            }).catch(e => console.warn("Aviso de impresión:", e));
          }

          App.hideLoader();
          advancePickStep();
        } else {
          App.hideLoader();
          App.showToast("Error actualizando estatus: " + (res?.message || "Error desconocido"), "error");
        }
      } catch (e) {
        App.hideLoader();
        App.showToast("Error de conexión: " + e.message, "error");
      }
    } else {
      App.showToast(`❌ Código (${scannedClean}) no coincide con (${current.parentMaterialId}).`, "error");
      const input = document.getElementById("input-pick-scan");
      if (input) { input.value = ""; input.focus(); }
    }
  }

  async function reportIssue(issueType) {
    const current = selectedOrders[currentPickIndex];
    const confirmMsg = issueType === 'MATERIAL_DANADO' 
      ? `¿Confirmas que el sobrante ${current.parentMaterialId} está DAÑADO?`
      : `¿Confirmas que el sobrante ${current.parentMaterialId} está AUSENTE?`;

    if (!confirm(confirmMsg)) return;

    App.showLoader("⚠️ Enviando reporte de incidencia a Standby...");

    try {
      const res = await GasAPI.send("reportPickIssueToStandby", {
        parentMaterialId: current.parentMaterialId,
        issueType: issueType,
        operatorId: currentUser
      });

      if (res && res.success) {
        App.showToast(`⚠️ Incidencia ${issueType} registrada en Standby.`, "warning");
        
        const dbPickers = App.getDbTable("tbPickers") || [];
        dbPickers.forEach(a => {
          if (String(a.MATERIAL_ID || a.materialId).trim() === current.parentMaterialId) {
            a.STATUS = "STANDBY_REPORTED";
          }
        });

        App.hideLoader();
        advancePickStep();
      } else {
        App.hideLoader();
        App.showToast("Error reportando incidencia: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (e) {
      App.hideLoader();
      App.showToast("Error en comunicación con el servidor: " + e.message, "error");
    }
  }

  function advancePickStep() {
    selectedOrders.splice(currentPickIndex, 1);
    const target = getContainer();
    
    if (selectedOrders.length > 0) {
      if (currentPickIndex >= selectedOrders.length) currentPickIndex = 0;
      renderPickCard(target);
    } else {
      App.showToast("🎉 ¡Ruta de recolección finalizada exitosamente!", "success");
      renderMainPicker(target);
    }
  }

  return {
    render: render,
    handleLogin: handleLogin,
    logout: logout,
    toggleSelectGroup: toggleSelectGroup,
    handleSearchSubmit: handleSearchSubmit,
    onSearchInput: onSearchInput,
    clearSearch: clearSearch,
    goBackToMenu: goBackToMenu,
    startRoute: startRoute,
    renderMainPicker: renderMainPicker,
    verifyPickScan: verifyPickScan,
    reportIssue: reportIssue
  };
})();
