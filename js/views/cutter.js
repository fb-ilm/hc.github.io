/**
 * Frontend - Vista para Estación de Corte con Selección de Mesa/Estación
 * Archivo: js/views/cutter.js
 */

const CutterView = (function () {
  let currentStation = localStorage.getItem("session_cutter_station") || "";
  let currentLayoutData = null;
  let pollingTimer = null;
  let isProcessingSave = false;

  function getContainer() {
    return document.getElementById("cutter-view") || document.getElementById("main-content");
  }

  function render(container) {
    stopAutoRefresh();
    const target = container || getContainer();

    if (!currentStation) {
      renderStationLogin(target);
      return;
    }

    const savedIp = localStorage.getItem("cutter_printer_ip") || "10.35.80.114";

    target.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; color: #fff; padding: 10px 16px; border-radius: 6px; margin-bottom: 12px;">
          <div>
            <span style="font-size: 0.75rem; color: #94a3b8;">ESTACIÓN DE CORTE:</span>
            <span style="font-family: monospace; font-weight: bold; color: #38bdf8; margin-left: 6px; font-size: 1rem;">📍 ${currentStation}</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger" style="color: #fff; border-color: #ef4444;" onclick="CutterView.logoutStation()">Cambiar Estación</button>
        </div>

        <h2>Estación de conteo</h2>
        <p class="text-muted">Escanea la orden para visualizar el acomodo de las ordenes en los sobrantes de ser necesario.</p>
      </div>

      <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; flex: 1; min-width: 320px;">
          <form id="form-scan-cutter" onsubmit="CutterView.lookupLayout(); return false;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-weight: bold; font-size: 0.9rem;">Escanear Shopfloor ID</label>
              <div style="display: flex; gap: 8px; margin-top: 6px;">
                <input type="text" id="cutter-scan-input" class="form-control" placeholder="Escanea el shopfloor id..." autofocus required style="font-family: monospace; font-size: 1.1rem;">
                <button type="submit" class="btn btn-primary">Buscar Layout</button>
              </div>
            </div>
          </form>
        </div>

        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; width: 340px;">
          <label style="font-weight: bold; font-size: 0.85rem; color: #334155;">🖨️ IP Impresora Zebra (ZPL)</label>
          <input type="text" id="input-printer-ip" class="form-control" value="${savedIp}" placeholder="Ej: 10.35.80.172" style="font-family: monospace; font-size: 0.9rem; margin-top: 4px; margin-bottom: 10px;" onchange="localStorage.setItem('cutter_printer_ip', this.value.trim())">
          
          <button type="button" class="btn btn-outline-secondary btn-block" style="font-size: 0.85rem;" onclick="CutterView.openAddSobranteModal()">
            ➕ Agregar Sobrante Manual
          </button>
        </div>
      </div>

      <div id="cutter-layout-result">
        <p style="color: #64748b; font-style: italic;">Esperando lectura de código de barras...</p>
      </div>
    `;

    App.refreshDatabase();
    startAutoRefresh();

    setTimeout(() => {
      const input = document.getElementById("cutter-scan-input");
      if (input) input.focus();
    }, 100);
  }

  function renderStationLogin(container) {
    const target = container || getContainer();
    target.innerHTML = `
      <div style="max-width: 440px; margin: 40px auto; padding: 24px; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <h3 style="color: #0f172a; margin-top: 0;">Estación de conteo</h3>
        <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 20px;">Selecciona la mesa/estación de trabajo para iniciar.</p>
        
        <form onsubmit="CutterView.handleStationSelect(event); return false;">
          <div style="margin-bottom: 16px; text-align: left;">
            <label style="font-size: 0.8rem; font-weight: bold; color: #334155;">Seleccionar Estación / Mesa:</label>
            <select id="select-cutter-station" class="form-control" style="font-size: 1rem; height: 44px; font-family: monospace; font-weight: bold;" required>
              <option value="ESTACION_1">HYC_CNTK_09</option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary btn-block" style="height: 48px; font-weight: bold; font-size: 1rem;">
            Iniciar en esta estación
          </button>
        </form>
      </div>
    `;
  }

  function handleStationSelect(e) {
    if (e) e.preventDefault();
    const selectEl = document.getElementById("select-cutter-station");
    if (!selectEl) return;

    currentStation = selectEl.value;
    localStorage.setItem("session_cutter_station", currentStation);
    App.showToast(`Estación activa: ${currentStation}`, "success");

    render(getContainer());
  }

  function logoutStation() {
    localStorage.removeItem("session_cutter_station");
    currentStation = "";
    currentLayoutData = null;
    App.showToast("Estación de trabajo liberada.", "info");
    render(getContainer());
  }

  function startAutoRefresh() {
    pollingTimer = setInterval(async () => {
      const cutterSection = document.getElementById("cutter-view");
      if (cutterSection && !cutterSection.classList.contains("hidden")) {
        await App.refreshDatabase();
      } else {
        stopAutoRefresh();
      }
    }, 60000);
  }

  function stopAutoRefresh() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function lookupLayout() {
    const rawCode = document.getElementById("cutter-scan-input").value.trim();
    const container = document.getElementById("cutter-layout-result");

    if (!rawCode || rawCode.length < 10) {
      App.showToast("Ingresa un código de orden válido de al menos 10 dígitos.", "warning");
      return;
    }

    const prefix10 = rawCode.substring(0, 10);
    const assignments = App.getDbTable("tbAsignaciones") || [];
    const subSobrantes = App.getDbTable("tbSobrantesResultantes") || [];

    const matchedAssignment = assignments.find(a => {
      const ordId = String(a.ORDER_ID || a.orderId || "").trim();
      const status = String(a.STATUS || a.status || "").trim().toUpperCase();
      return ordId.substring(0, 10) === prefix10 && status === "TOMADO";
    });

    if (!matchedAssignment) {
      container.innerHTML = `
        <div class="alert alert-danger" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 16px; border-radius: 6px;">
          ❌ No se encontró ninguna asignación activa con estatus <b>'TOMADO'</b> para el lote <b>${prefix10}</b>.
        </div>`;
      return;
    }

    const parentMatIdStr = String(matchedAssignment.MATERIAL_ID || matchedAssignment.materialId || "").trim();

    const siblingOrders = assignments.filter(a => {
      const pId = String(a.MATERIAL_ID || a.materialId || "").trim();
      const st = String(a.STATUS || a.status || "").trim().toUpperCase();
      return pId === parentMatIdStr && st === "TOMADO";
    });

    const matchedSubRems = subSobrantes.filter(s => {
      const pKey = String(s.PARENT_MATERIAL_ID || s.parentMaterialId || s.MATERIAL_PADRE || s.parent_material_id || "").trim();
      return pKey === parentMatIdStr;
    });

    const subRemanentsWithState = matchedSubRems.map((s, idx) => {
      const subId = String(s.SUB_MATERIAL_ID || s.subMaterialId || s.sub_material_id || `SUB-${idx + 1}`);
      const w = Number(s.WIDTH || s.width || 0);
      const c = Number(s.CELLS || s.cells || 0);
      let typeStr = String(s.TYPE || s.type || "").trim().toUpperCase();

      if (!typeStr) {
        typeStr = subId.includes("-SUB2") ? 'BOTTOM' : 'LATERAL';
      }

      return {
        subMaterialId: subId,
        parentMaterialId: parentMatIdStr,
        pcnId: s.PCN_ID || s.pcnId || matchedAssignment.PCN_ID,
        width: w,
        cells: c,
        rack: s.RACK || s.rack || matchedAssignment.RACK || '',
        loc: s.LOC || s.loc || matchedAssignment.LOC || '',
        type: typeStr,
        statusConfirmation: (String(s.STATUS || s.status).toUpperCase() === 'NO_SALVADO') ? 'NO_SALVADO' : 'SALVADO'
      };
    });

    currentLayoutData = {
      parentMatId: parentMatIdStr,
      mainOrder: matchedAssignment,
      siblingOrders: siblingOrders,
      subRemanents: subRemanentsWithState
    };

    renderLayoutGraphic();
  }

  // RENDERIZADO DEL ACOMODO BASADO EN LA COLUMNA LAYOUT_TYPE DE tbAsignaciones
  function renderLayoutGraphic() {
    if (!currentLayoutData) return;

    const { parentMatId, mainOrder, siblingOrders, subRemanents } = currentLayoutData;
    const container = document.getElementById("cutter-layout-result");

    // 1. RECUPERAR LAYOUT_TYPE DESDE LA ASIGNACIÓN GUARDADA
    const rawLayoutVal = String(mainOrder.LAYOUT_TYPE || mainOrder.layoutType || "ROW").trim().toUpperCase();
    const isVertical = rawLayoutVal.includes("COLUMN") || rawLayoutVal.includes("VERT") || rawLayoutVal === "CELLS";

    const sumOrdersW = siblingOrders.reduce((sum, o) => sum + Number(o.WIDTH || o.width || 0), 0);
    const sumOrdersC = siblingOrders.reduce((sum, o) => sum + Number(o.CELLS || o.cells || 0), 0);

    const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];

    const subLateral = subRemanents.find(s => s.type === 'LATERAL') || (subRemanents.length > 0 ? subRemanents[0] : null);
    const subBottom = subRemanents.find(s => s.type === 'BOTTOM') || (subRemanents.length > 1 ? subRemanents[1] : null);

    let ordersListHtml = "";
    siblingOrders.forEach((ord) => {
      ordersListHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px; font-weight: bold; font-family: monospace; color: #2563eb;">${ord.ORDER_ID || ord.orderId}</td>
          <td style="padding: 6px;">${ord.PCN_ID || ord.pcnId}</td>
          <td style="padding: 6px;">${ord.WIDTH || ord.width}W x ${ord.CELLS || ord.cells}C</td>
        </tr>`;
    });

    const topBlockHeight = subBottom && subBottom !== subLateral ? "70%" : "100%";
    const ordersColWidth = subLateral ? "65%" : "100%";

    let layoutGraphicHtml = `
      <div style="position: relative; width: 100%; height: 340px; background: #0f172a; border: 2px solid #475569; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; padding: 6px; gap: 6px;">
        <div style="display: flex; width: 100%; height: ${topBlockHeight}; gap: 6px; overflow: hidden;">
          <div style="width: ${ordersColWidth}; height: 100%; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; gap: 3px;">`;

    siblingOrders.forEach((ord, idx) => {
      const w = Number(ord.WIDTH || ord.width || 0);
      const c = Number(ord.CELLS || ord.cells || 0);

      // Si es VERTICAL calcula por Celdas (sumOrdersC), si es HORIZONTAL por Ancho (sumOrdersW)
      const pieceDimension = isVertical ? c : w;
      const totalDimension = isVertical ? (sumOrdersC || 1) : (sumOrdersW || 1);
      const pct = (pieceDimension / totalDimension) * 100 || 0;
      const bg = colors[idx % colors.length];

      const pieceStyle = isVertical ? `width: 100%; height: ${pct}%;` : `width: ${pct}%; height: 100%;`;

      layoutGraphicHtml += `
        <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.8rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; border-radius: 3px; box-sizing: border-box; overflow: hidden;" title="${ord.ORDER_ID}">
          <span><b>${ord.ORDER_ID || ord.orderId}</b></span>
          <span style="font-size: 0.72rem; opacity: 0.9;">${w}W x ${c}C</span>
        </div>`;
    });

    layoutGraphicHtml += `</div>`;

    if (subLateral) {
      const subId = subLateral.subMaterialId;
      const w = subLateral.width;
      const c = subLateral.cells;
      const isSaved = subLateral.statusConfirmation === 'SALVADO';
      const bgStyle = isSaved ? 'background: #1e293b; border: 2px dashed #38bdf8;' : 'background: #7f1d1d; border: 2px dashed #fca5a5;';
      const badgeText = isSaved ? '✅ SALVADO' : '❌ NO SALVADO';

      layoutGraphicHtml += `
        <div onclick="CutterView.openSubConfirmationModal('${subId}')" style="width: 35%; height: 100%; ${bgStyle} border-radius: 4px; color: #ffffff; font-size: 0.8rem; font-weight: bold; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 6px; cursor: pointer;">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.85rem;">✂️ ${subId}</span>
          <span style="font-size: 0.75rem; color: #cbd5e1; margin-top: 2px;">${w}W x ${c}C</span>
          <span style="font-size: 0.65rem; margin-top: 6px; background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 3px;">${badgeText}</span>
        </div>`;
    }

    layoutGraphicHtml += `</div>`;

    if (subBottom && subBottom !== subLateral) {
      const subId = subBottom.subMaterialId;
      const w = subBottom.width;
      const c = subBottom.cells;
      const isSaved = subBottom.statusConfirmation === 'SALVADO';
      const bgStyle = isSaved ? 'background: #1e293b; border: 2px dashed #38bdf8;' : 'background: #7f1d1d; border: 2px dashed #fca5a5;';
      const badgeText = isSaved ? '✅ SALVADO' : '❌ NO SALVADO';

      layoutGraphicHtml += `
        <div onclick="CutterView.openSubConfirmationModal('${subId}')" style="width: 100%; height: 30%; ${bgStyle} border-radius: 4px; color: #ffffff; font-size: 0.8rem; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 12px; cursor: pointer;">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.85rem;">✂️ ${subId}</span>
          <span style="font-size: 0.75rem; color: #cbd5e1;">(${w}W x ${c}C)</span>
          <span style="font-size: 0.65rem; background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 3px;">${badgeText}</span>
        </div>`;
    }

    layoutGraphicHtml += `</div>`;

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 380px 1fr; gap: 20px;">
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <h3 style="color: #0f172a; margin-bottom: 4px;">Sobrante Padre: <span style="color: #2563eb; font-family: monospace;">${parentMatId}</span></h3>
          <p style="font-size: 0.82rem; color: #475569; margin-bottom: 16px;">
            <b>PCN:</b> ${mainOrder.PCN_ID || mainOrder.pcnId} | <b>Ubicación:</b> ${mainOrder.RACK || 'N/A'}-${mainOrder.LOC || 'N/A'}
          </p>

          <h4 style="font-size: 0.85rem; color: #16a34a; margin-bottom: 8px;">Órdenes 'TOMADAS' (${siblingOrders.length})</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 16px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 6px;">ORDER_ID</th>
                <th style="padding: 6px;">PCN</th>
                <th style="padding: 6px;">MEDIDAS</th>
              </tr>
            </thead>
            <tbody>${ordersListHtml}</tbody>
          </table>

          <button type="button" class="btn btn-success btn-block" style="font-weight: bold; margin-top: 10px;" onclick="CutterView.saveCutConfirmation()">
            💾 Guardar, Finalizar Corte e Imprimir Etiquetas
          </button>
        </div>

        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">Plano de Corte Interactivo</h3>
            <span style="font-size: 0.75rem; color: #64748b;">👉 Haz clic en un sobrante para modificar su estatus</span>
          </div>
          ${layoutGraphicHtml}
        </div>
      </div>
    `;
  }

  function openSubConfirmationModal(subMaterialId) {
    if (!currentLayoutData) return;

    const sub = currentLayoutData.subRemanents.find(s => String(s.subMaterialId) === String(subMaterialId));
    if (!sub) return;

    const modalHtml = `
      <div id="modal-sub-confirm-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 480px; border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <h3 style="margin-top: 0; color: #1e293b;">✂️ Confirmación de Sobrante</h3>
          <p style="font-size: 0.9rem; color: #475569; margin-bottom: 12px;">
            Sobrante: <b style="font-family: monospace; color: #2563eb;">${subMaterialId}</b><br>
            Dimensiones estimadas: <b>${sub.width}W x ${sub.cells}C</b>
          </p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
            <strong style="font-size: 0.8rem; color: #0f172a; display: block; margin-bottom: 8px;">📐 ¿Las medidas reales son distintas? Corrígelas aquí:</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 0.75rem; font-weight: bold;">WIDTH (Min 24W)</label>
                <input type="number" id="edit-sub-width" class="form-control" value="${sub.width}" min="24" step="0.1" style="font-size: 0.85rem;">
              </div>
              <div>
                <label style="font-size: 0.75rem; font-weight: bold;">CELLS (Min 30C)</label>
                <input type="number" id="edit-sub-cells" class="form-control" value="${sub.cells}" min="30" step="1" style="font-size: 0.85rem;">
              </div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button class="btn btn-outline-danger" onclick="CutterView.setSubStatus('${subMaterialId}', 'NO_SALVADO')">
                ❌ Dañado / Descartado
              </button>
              <button class="btn btn-warning" onclick="CutterView.editSubDimensions('${subMaterialId}')">
                ✏️ Guardar Nuevas Medidas
              </button>
            </div>
            <button class="btn btn-success btn-block" style="font-weight: bold; height: 40px;" onclick="CutterView.setSubStatus('${subMaterialId}', 'SALVADO')">
              ✅ Sí, Confirmar con Medidas Estimadas
            </button>
          </div>

          <div style="text-align: right; margin-top: 12px;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('modal-sub-confirm-popup').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-sub-confirm-popup");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  function editSubDimensions(subMaterialId) {
    const inputW = parseFloat(document.getElementById("edit-sub-width").value);
    const inputC = parseInt(document.getElementById("edit-sub-cells").value, 10);

    if (isNaN(inputW) || isNaN(inputC)) {
      App.showToast("Ingresa valores numéricos válidos.", "error");
      return;
    }

    if (inputW < 24 || inputC < 30) {
      App.showToast(`⚠️ Las medidas no cumplen con el mínimo permitido (Mínimo: 24W x 30C). Valor ingresado: ${inputW}W x ${inputC}C.`, "warning");
      return;
    }

    const modal = document.getElementById("modal-sub-confirm-popup");
    if (modal) modal.remove();

    if (currentLayoutData) {
      let sub = currentLayoutData.subRemanents.find(s => String(s.subMaterialId) === String(subMaterialId));
      if (sub) {
        sub.width = inputW;
        sub.cells = inputC;
        sub.statusConfirmation = 'SALVADO';

        App.showToast(`📐 Dimensiones de ${subMaterialId} actualizadas a ${inputW}W x ${inputC}C`, "success");
        renderLayoutGraphic();
      }
    }
  }

  function setSubStatus(subMaterialId, status) {
    const modal = document.getElementById("modal-sub-confirm-popup");
    if (modal) modal.remove();

    if (currentLayoutData) {
      let sub = currentLayoutData.subRemanents.find(s => String(s.subMaterialId) === String(subMaterialId));
      if (sub) {
        sub.statusConfirmation = status;
        App.showToast(`Estatus de ${subMaterialId} actualizado a: ${status}`, "info");
        renderLayoutGraphic();
      }
    }
  }

  function openAddSobranteModal() {
    const defaultPcn = currentLayoutData?.mainOrder?.PCN_ID || "";
    const defaultRack = currentLayoutData?.mainOrder?.RACK || "";
    const defaultLoc = currentLayoutData?.mainOrder?.LOC || "";

    const modalHtml = `
      <div id="modal-add-sobrante" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 440px; border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <h3 style="margin-top: 0; color: #0f172a;">➕ Registrar Nuevo Sobrante</h3>
          
          <form onsubmit="CutterView.saveManualSobrante(event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px;">
              <div>
                <label style="font-size: 0.8rem; font-weight: bold;">WIDTH (Min 24W)</label>
                <input type="number" id="manual-width" class="form-control" required min="24" step="0.1">
              </div>
              <div>
                <label style="font-size: 0.8rem; font-weight: bold;">CELLS (Min 30C)</label>
                <input type="number" id="manual-cells" class="form-control" required min="30">
              </div>
            </div>

            <div style="margin-top: 10px;">
              <label style="font-size: 0.8rem; font-weight: bold;">PCN_ID</label>
              <input type="text" id="manual-pcn" class="form-control" value="${defaultPcn}" required style="font-family: monospace;">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
              <div>
                <label style="font-size: 0.8rem; font-weight: bold;">RACK</label>
                <input type="text" id="manual-rack" class="form-control" value="${defaultRack}" required>
              </div>
              <div>
                <label style="font-size: 0.8rem; font-weight: bold;">LOCACIÓN</label>
                <input type="text" id="manual-loc" class="form-control" value="${defaultLoc}" required>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-add-sobrante').remove()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar e Imprimir</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-add-sobrante");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  async function saveManualSobrante(event) {
    event.preventDefault();
    
    const w = parseFloat(document.getElementById("manual-width").value);
    const c = parseInt(document.getElementById("manual-cells").value, 10);
    const pcn = document.getElementById("manual-pcn").value.trim();
    const rack = document.getElementById("manual-rack").value.trim();
    const loc = document.getElementById("manual-loc").value.trim();

    if (w < 24 || c < 30) {
      App.showToast("Las medidas mínimas para guardar sobrante son 24W y 30C.", "warning");
      return;
    }

    document.getElementById("modal-add-sobrante").remove();
    App.showLoader("Guardando nuevo sobrante manual en tbInventario...");

    try {
      const res = await GasAPI.send("addManualSobranteToInventario", {
        width: w,
        cells: c,
        pcnId: pcn,
        rack: rack,
        loc: loc,
        stationId: currentStation
      });

      App.hideLoader();

      if (res && res.success) {
        App.showToast("Sobrante ingresado correctamente al inventario.", "success");

        printZebraLabel4x1({
          subMaterialId: res.generatedSubId || "NW",
          parentMaterialId: "NEW",
          pcnId: pcn,
          width: w,
          cells: c,
          rack: rack,
          loc: loc
        });

        await App.refreshDatabase();
      } else {
        App.showToast("Error al agregar sobrante: " + (res?.message || "Desconocido"), "error");
      }
    } catch (e) {
      App.hideLoader();
      App.showToast("Error de comunicación: " + e.message, "error");
    }
  }

  async function saveCutConfirmation() {
    if (!currentLayoutData) return;
    
    if (isProcessingSave) return;
    isProcessingSave = true;

    const saveBtn = document.querySelector("button[onclick='CutterView.saveCutConfirmation()']");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = "⏳ Guardando e imprimiendo...";
    }

    const { parentMatId, subRemanents, mainOrder } = currentLayoutData;
    const session = AuthService.getSession();
    const currentUserEmail = (session && session.user && session.user.email) ? session.user.email : "OPERADOR_CORTE";

    const uniqueSubRemsMap = {};
    subRemanents.forEach(sub => {
      const subId = String(sub.subMaterialId).trim();
      if (!uniqueSubRemsMap[subId]) {
        uniqueSubRemsMap[subId] = {
          subMaterialId: subId,
          parentMaterialId: parentMatId,
          pcnId: sub.pcnId || mainOrder.PCN_ID,
          width: sub.width,
          cells: sub.cells,
          rack: sub.rack || mainOrder.RACK || '',
          loc: sub.loc || mainOrder.LOC || '',
          statusConfirmation: sub.statusConfirmation || 'SALVADO',
          stationId: currentStation
        };
      }
    });

    const updates = Object.values(uniqueSubRemsMap);

    App.showLoader("Procesando corte e ingresando a tbInventario...");

    try {
      const res = await GasAPI.send("confirmCutterSobrantes", {
        parentMaterialId: parentMatId,
        operatorEmail: currentUserEmail,
        updates: updates
      });

      if (res && res.success) {
        App.showToast("Corte y sobrantes procesados correctamente.", "success");

        const savedSubRems = updates.filter(s => s.statusConfirmation === 'SALVADO');
        if (savedSubRems.length > 0) {
          await printZebraBatch(savedSubRems);
        }

        await App.refreshDatabase();
        currentLayoutData = null;
        App.hideLoader();
        render(getContainer());

      } else {
        App.hideLoader();
        App.showToast("Error al guardar: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error en la solicitud: " + err.message, "error");
    } finally {
      isProcessingSave = false;
    }
  }

  async function printZebraBatch(subDataArray) {
    const targetIp = getTargetPrinterIp();
    const today = new Date().toLocaleDateString('en-US');

    let fullZplBatch = "";

    subDataArray.forEach(sub => {
      const subId = sub.subMaterialId || sub.subId || "S001";
      const parentId = sub.parentMaterialId || sub.parentId || "N/A";
      const pcn = sub.pcnId || sub.pcn || "N/A";
      const w = sub.width || 0;
      const c = sub.cells || 0;
      const rack = sub.rack || "";
      const loc = sub.loc || "";

      fullZplBatch += 
        "^XA\n" +
        "^SZ2\n" +
        "^PW812\n" +
        "^LL203\n" +
        "^PON\n" +
        "^LH0,0\n" +
        "^MNG\n" +
        "^MTT\n" +
        "^LT0\n" +
        "^LS0\n" +
        "^FO25,12^A0N,24,24^FDIDREMANENTE: " + subId + "^FS\n" +
        "^FO25,40^A0N,18,18^FDORIGEN: " + parentId + " | PCN: " + pcn + "^FS\n" +
        "^FO25,65^A0N,20,20^FDDIMS: " + w + "W x " + c + "C^FS\n" +
        "^FO25,90^A0N,18,18^FDUBICACION: RACK " + rack + "-" + loc + "^FS\n" +
        "^FO25,115^A0N,16,16^FDFECHA: " + today + "^FS\n" +
        "^FO460,15^BY2,2,60^BCN,60,Y,N,N^FD" + subId + "^FS\n" +
        "^XZ\n";
    });

    App.showLoader(`Enviando ${subDataArray.length} etiqueta(s) a Zebra (${targetIp})...`);

    try {
      await fetch(`http://${targetIp}/pstprnt`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: fullZplBatch,
        mode: "no-cors"
      });

      App.hideLoader();
      App.showToast(`🖨️ ${subDataArray.length} etiqueta(s) enviada(s) correctamente a ${targetIp}`, "success");

    } catch (e) {
      App.hideLoader();
      App.showToast("Error conectando con la impresora: " + e.message, "error");
    }
  }

  async function printZebraLabel4x1(subData) {
    await printZebraBatch([subData]);
  }

  function getTargetPrinterIp() {
    const inputIp = document.getElementById("input-printer-ip")?.value.trim();
    if (inputIp) {
      localStorage.setItem("cutter_printer_ip", inputIp);
      return inputIp;
    }
    return localStorage.getItem("cutter_printer_ip") || "10.35.80.172";
  }

  return {
    render: render,
    handleStationSelect: handleStationSelect,
    logoutStation: logoutStation,
    lookupLayout: lookupLayout,
    openSubConfirmationModal: openSubConfirmationModal,
    editSubDimensions: editSubDimensions,
    setSubStatus: setSubStatus,
    openAddSobranteModal: openAddSobranteModal,
    saveManualSobrante: saveManualSobrante,
    saveCutConfirmation: saveCutConfirmation,
    printZebraLabel4x1: printZebraLabel4x1
  };
})();
