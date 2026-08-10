/**
 * Frontend - Vista Móvil / Handheld para Recolección en Piso
 * Archivo: js/views/mobile_picker.js
 */

const MobilePickerView = (function () {
  let currentUser = localStorage.getItem("session_picker_user") || "";
  let selectedOrders = [];
  let currentPickIndex = 0;
  let searchFilterQuery = "";

  // Helper para obtener siempre el contenedor correcto de la pestaña
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

  // 1. PANTALLA DE ACCESO MÓVIL POR NÚMERO DE EMPLEADO
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

  function handleLogin(e) {
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
    
    // Renderizado inmediato sobre el contenedor correcto
    render(getContainer());
  }

  function logout() {
    localStorage.removeItem("session_picker_user");
    currentUser = "";
    selectedOrders = [];
    searchFilterQuery = "";
    App.showToast("Sesión del recolector cerrada.", "info");
    render(getContainer());
  }

  // 2. VISTA PRINCIPAL - ESTRUCTURA BASE
  function renderMainPicker(container) {
    const target = container || getContainer();
    target.innerHTML = `
      <div style="max-width: 480px; margin: 0 auto; padding-bottom: 20px;">
        <!-- CABECERA DE SESIÓN -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; color: #fff; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px;">
          <div>
            <span style="font-size: 0.75rem; color: #94a3b8;">RECOLECTOR:</span>
            <span style="font-family: monospace; font-weight: bold; color: #38bdf8; margin-left: 4px;">${currentUser}</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger" style="color: #fff; border-color: #ef4444;" onclick="MobilePickerView.logout()">Salir</button>
        </div>

        <!-- BÚSQUEDA Y FILTRADO POR ORDEN -->
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

        <!-- CONTENEDOR DINÁMICO DE TARJETAS -->
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

    const assignments = App.getDbTable("tbAsignaciones") || [];
    const activeAssignments = assignments.filter(a => String(a.STATUS || a.status || "").trim().toUpperCase() === "ACTIVADO");

    const groupsMap = {};
    activeAssignments.forEach(a => {
      const parentId = String(a.MATERIAL_ID || a.materialId).trim();
      if (!groupsMap[parentId]) {
        groupsMap[parentId] = {
          parentMaterialId: parentId,
          rack: a.RACK || 'N/A',
          loc: a.LOC || 'N/A',
          pcnId: a.PCN_ID || a.pcnId,
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
        ${searchFilterQuery ? `No se encontraron sobrantes padre que contengan la orden "${searchFilterQuery}".` : 'No hay órdenes con estatus "ACTIVADO" pendientes.'}
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
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-family: monospace; font-size: 1rem; color: #1e293b;">PADRE: ${g.parentMaterialId}</strong>
            <span class="badge" style="background: #0284c7; color: #fff; font-size: 0.8rem; padding: 4px 8px;">
              📍 ${g.rack}-${g.loc}
            </span>
          </div>
          <div style="font-size: 0.8rem; color: #475569; margin-bottom: 6px;">
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
      const assignments = App.getDbTable("tbAsignaciones") || [];
      const groupOrders = assignments.filter(a => String(a.MATERIAL_ID || a.materialId).trim() === parentMaterialId && String(a.STATUS).toUpperCase() === 'ACTIVADO');

      if (groupOrders.length > 0) {
        selectedOrders.push({
          parentMaterialId: parentMaterialId,
          rack: groupOrders[0].RACK || 'N/A',
          loc: groupOrders[0].LOC || 'N/A',
          pcnId: groupOrders[0].PCN_ID || groupOrders[0].pcnId,
          orders: groupOrders
        });
      }
    }
    renderCardsOnly();
  }

  // 3. VISTA PASO A PASO EN LA RUTA
  function startRoute() {
    if (selectedOrders.length === 0) {
      App.showToast("Selecciona al menos un sobrante padre para iniciar.", "warning");
      return;
    }
    currentPickIndex = 0;
    renderPickCard(getContainer());
  }

  function renderPickCard(container) {
    const target = container || getContainer();
    const current = selectedOrders[currentPickIndex];

    if (!current) {
      renderMainPicker(target);
      return;
    }

    const parentMatIdStr = String(current.parentMaterialId).trim();

    const allSubSobrantes = App.getDbTable("tbSobrantesResultantes") || [];
    const matchedSubRems = allSubSobrantes.filter(s => {
      const pKey = String(s.PARENT_MATERIAL_ID || s.parentMaterialId || s.MATERIAL_PADRE || s.parent_material_id || "").trim();
      return pKey === parentMatIdStr;
    }).map((s, idx) => {
      const subId = String(s.SUB_MATERIAL_ID || s.subMaterialId || s.sub_material_id || `SUB-${idx + 1}`);
      const w = Number(s.WIDTH || s.width || 0);
      const c = Number(s.CELLS || s.cells || 0);
      let typeStr = String(s.TYPE || s.type || "").trim().toUpperCase();

      if (!typeStr) {
        typeStr = subId.includes("-SUB2") ? 'BOTTOM' : 'LATERAL';
      }

      return {
        subMaterialId: subId,
        width: w,
        cells: c,
        type: typeStr
      };
    });

    const subLateral = matchedSubRems.find(s => s.type === 'LATERAL') || (matchedSubRems.length > 0 ? matchedSubRems[0] : null);
    const subBottom = matchedSubRems.find(s => s.type === 'BOTTOM') || (matchedSubRems.length > 1 ? matchedSubRems[1] : null);

    const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];
    const sumW = current.orders.reduce((sum, o) => sum + Number(o.WIDTH || o.width || 0), 0);
    const sumC = current.orders.reduce((sum, o) => sum + Number(o.CELLS || o.cells || 0), 0);
    const maxC = current.orders.reduce((max, o) => Math.max(max, Number(o.CELLS || o.cells || 0)), 0);
    
    const isVertical = sumC > maxC;

    let ordersListHtml = "";
    let ordersPiecesHtml = "";

    current.orders.forEach((o, idx) => {
      const ordId = o.ORDER_ID || o.orderId || "N/A";
      const w = Number(o.WIDTH || o.width || 0);
      const c = Number(o.CELLS || o.cells || 0);
      const bg = colors[idx % colors.length];

      ordersListHtml += `<li style="font-family: monospace; font-size: 0.85rem;"><b>${ordId}</b> (${w}W x ${c}C)</li>`;

      const pieceDimension = isVertical ? c : w;
      const totalDimension = isVertical ? sumC : sumW;
      const pct = (pieceDimension / totalDimension) * 100 || 0;
      const pieceStyle = isVertical ? `width: 100%; height: ${pct}%;` : `width: ${pct}%; height: 100%;`;

      ordersPiecesHtml += `
        <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.72rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; border-radius: 2px; overflow: hidden;" title="${ordId}">
          <span><b>${ordId}</b></span>
          <span style="font-size: 0.65rem; opacity: 0.9;">${w}W x ${c}C</span>
        </div>`;
    });

    const topBlockHeight = (subBottom && subBottom !== subLateral) ? "70%" : "100%";
    const ordersColWidth = subLateral ? "65%" : "100%";

    let layoutGraphicHtml = `
      <div style="position: relative; width: 100%; height: 170px; background: #0f172a; border: 2px solid #475569; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; padding: 4px; gap: 4px;">
        <div style="display: flex; width: 100%; height: ${topBlockHeight}; gap: 4px; overflow: hidden;">
          <div style="width: ${ordersColWidth}; height: 100%; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; gap: 2px;">
            ${ordersPiecesHtml}
          </div>`;

    if (subLateral) {
      layoutGraphicHtml += `
        <div style="width: 35%; height: 100%; background: #1e293b; border: 2px dashed #38bdf8; border-radius: 4px; color: #ffffff; font-size: 0.75rem; font-weight: bold; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 2px;" title="Sobrante Resultante: ${subLateral.subMaterialId}">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.75rem;">✂️ ${subLateral.subMaterialId}</span>
          <span style="font-size: 0.68rem; color: #cbd5e1; margin-top: 2px;">${subLateral.width}W x ${subLateral.cells}C</span>
        </div>`;
    }

    layoutGraphicHtml += `</div>`;

    if (subBottom && subBottom !== subLateral) {
      layoutGraphicHtml += `
        <div style="width: 100%; height: 30%; background: #1e293b; border: 2px dashed #38bdf8; border-radius: 4px; color: #ffffff; font-size: 0.75rem; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 8px;" title="Sobrante Resultante: ${subBottom.subMaterialId}">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.75rem;">✂️ ${subBottom.subMaterialId}</span>
          <span style="font-size: 0.68rem; color: #cbd5e1;">(${subBottom.width}W x ${subBottom.cells}C)</span>
        </div>`;
    }

    layoutGraphicHtml += `</div>`;

    target.innerHTML = `
      <div style="max-width: 480px; margin: 0 auto; padding-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="MobilePickerView.renderMainPicker(document.getElementById('picker-view') || document.getElementById('main-content'))">← Volver</button>
          <span style="font-size: 0.85rem; font-weight: bold; color: #64748b;">Material ${currentPickIndex + 1} de ${selectedOrders.length}</span>
        </div>

        <div class="card" style="padding: 16px; background: #fff; border-radius: 8px; border: 2px solid #2563eb; text-align: center; margin-bottom: 12px;">
          <span style="font-size: 0.8rem; font-weight: bold; color: #64748b; text-transform: uppercase;">UBICACIÓN FÍSICA RACK</span>
          <h1 style="margin: 4px 0 10px 0; color: #2563eb; font-size: 2.2rem;">📍 ${current.rack} - ${current.loc}</h1>
          <hr style="margin: 10px 0;">

          <div style="font-size: 0.9rem; text-align: left; color: #334155; margin-bottom: 12px;">
            <b>Sobrante Padre:</b> <span style="font-family: monospace; color: #2563eb; font-weight: bold;">${current.parentMaterialId}</span><br>
            <b>PCN:</b> ${current.pcnId}
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
      App.showLoader("Marcando material como TOMADO...");
      try {
        const res = await GasAPI.send("markAssignmentAsTaken", { parentMaterialId: current.parentMaterialId });
        App.hideLoader();

        if (res && res.success) {
          App.showToast(`✅ Material ${current.parentMaterialId} verificado y marcado como TOMADO!`, "success");
          await App.refreshDatabase();
          advancePickStep();
        } else {
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

    App.showLoader("Enviando reporte a Standby...");
    try {
      const res = await GasAPI.send("reportPickIssueToStandby", {
        parentMaterialId: current.parentMaterialId,
        issueType: issueType,
        operatorId: currentUser
      });
      App.hideLoader();

      if (res && res.success) {
        App.showToast(`⚠️ Incidencia ${issueType} registrada. La orden se envió a Standby.`, "warning");
        await App.refreshDatabase();
        advancePickStep();
      } else {
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
      App.showToast("🎉 ¡Ruta de recolección finalizada!", "success");
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
    startRoute: startRoute,
    renderMainPicker: renderMainPicker,
    verifyPickScan: verifyPickScan,
    reportIssue: reportIssue
  };
})();
