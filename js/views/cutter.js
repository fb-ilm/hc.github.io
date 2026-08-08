/**
 * Frontend - Vista para Estación de Corte / Consulta y Confirmación por Clic
 * Archivo: js/views/cutter.js
 */

const CutterView = (function () {
  let currentLayoutData = null;

  function render(container) {
    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px;">
        <h2>Estación de Corte y Liberación de Sobrantes</h2>
        <p class="text-muted">Escanea la orden, haz clic sobre los sobrantes en el plano para confirmar su recuperación física y finaliza el corte.</p>
      </div>

      <!-- BÚSQUEDA / ESCÁNER -->
      <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 20px; max-width: 650px;">
        <form id="form-scan-cutter" onsubmit="CutterView.lookupLayout(); return false;">
          <div class="form-group" style="margin-bottom: 12px;">
            <label style="font-weight: bold; font-size: 0.9rem;">Escanear Código de Orden / Shopfloor ID</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="cutter-scan-input" class="form-control" placeholder="Escanea o escribe los 10 dígitos..." autofocus required style="font-family: monospace; font-size: 1.1rem;">
              <button type="submit" class="btn btn-primary">🔍 Buscar Layout</button>
            </div>
          </div>
        </form>
      </div>

      <!-- ÁREA DE RESULTADO Y LAYOUT -->
      <div id="cutter-layout-result">
        <p style="color: #64748b; font-style: italic;">Esperando lectura de código de barras...</p>
      </div>
    `;

    setTimeout(() => {
      const input = document.getElementById("cutter-scan-input");
      if (input) input.focus();
    }, 100);
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
    const inventario = App.getDbTable("tbInventario") || [];

    const matchedAssignment = assignments.find(a => {
      const ordId = String(a.ORDER_ID || a.orderId || "").trim();
      return ordId.substring(0, 10) === prefix10;
    });

    if (!matchedAssignment) {
      container.innerHTML = `
        <div class="alert alert-danger" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 16px; border-radius: 6px;">
          ❌ No se encontró ninguna asignación para la orden con lote <b>${prefix10}</b>.
        </div>`;
      return;
    }

    const parentMatId = String(matchedAssignment.MATERIAL_ID || matchedAssignment.materialId || "").trim();

    const siblingOrders = assignments.filter(a => 
      String(a.MATERIAL_ID || a.materialId || "").trim() === parentMatId
    );

    const matchedSubRems = subSobrantes.filter(s => {
      const parentKey = String(s.PARENT_MATERIAL_ID || s.parentMaterialId || s.MATERIAL_PADRE || "").trim();
      return parentKey === parentMatId;
    });

    const parentMatInfo = inventario.find(i => String(i.MATERIAL_ID || i.materialId).trim() === parentMatId) || {
      WIDTH: matchedAssignment.WIDTH || 100,
      CELLS: matchedAssignment.CELLS || 200
    };

    const subRemanentsWithState = matchedSubRems.map(s => ({
      ...s,
      statusConfirmation: s.STATUS === 'NO_SALVADO' ? 'NO_SALVADO' : 'SALVADO'
    }));

    currentLayoutData = {
      parentMatId: parentMatId,
      mainOrder: matchedAssignment,
      siblingOrders: siblingOrders,
      subRemanents: subRemanentsWithState,
      parentMatInfo: parentMatInfo
    };

    renderLayoutGraphic();
  }

  function renderLayoutGraphic() {
    if (!currentLayoutData) return;

    const { parentMatId, mainOrder, siblingOrders, subRemanents, parentMatInfo } = currentLayoutData;
    const container = document.getElementById("cutter-layout-result");

    const origWidth = Number(parentMatInfo.WIDTH || mainOrder.WIDTH || 1);
    const origCells = Number(parentMatInfo.CELLS || mainOrder.CELLS || 1);

    const maxOrdersW = siblingOrders.reduce((max, o) => Math.max(max, Number(o.WIDTH || o.width)), 0);
    const sumOrdersW = siblingOrders.reduce((sum, o) => sum + Number(o.WIDTH || o.width), 0);
    const sumOrdersC = siblingOrders.reduce((sum, o) => sum + Number(o.CELLS || o.cells), 0);
    const maxOrdersC = siblingOrders.reduce((max, o) => Math.max(max, Number(o.CELLS || o.cells)), 0);

    const isVertical = sumOrdersC > maxOrdersC;
    const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];

    const usedWidthPct = isVertical ? (maxOrdersW / origWidth) * 100 : (sumOrdersW / origWidth) * 100;
    const usedCellsPct = isVertical ? (sumOrdersC / origCells) * 100 : (maxOrdersC / origCells) * 100;

    // --- RECONSTRUCCIÓN DINÁMICA DE SUB-REMANENTES ---
    let subLateral = subRemanents.find(s => s.type === 'LATERAL') || subRemanents[0];
    let subBottom = subRemanents.find(s => s.type === 'BOTTOM') || (subRemanents.length > 1 ? subRemanents[1] : null);

    // Si la BD no traía el tag explícito, reconstruir medidas netas del residuo
    if (!subLateral && usedWidthPct < 100) {
      const remW = origWidth - maxOrdersW;
      const remC = sumOrdersC;
      if (remW >= 24 && remC >= 30) {
        subLateral = {
          SUB_MATERIAL_ID: `${parentMatId}-SUB1`,
          WIDTH: Number(remW.toFixed(2)),
          CELLS: Number(remC.toFixed(2)),
          statusConfirmation: 'SALVADO'
        };
      }
    }

    if (!subBottom && usedCellsPct < 100) {
      const remW = origWidth;
      const remC = origCells - sumOrdersC;
      if (remW >= 24 && remC >= 30) {
        subBottom = {
          SUB_MATERIAL_ID: `${parentMatId}-SUB2`,
          WIDTH: Number(remW.toFixed(2)),
          CELLS: Number(remC.toFixed(2)),
          statusConfirmation: 'SALVADO'
        };
      }
    }

    let ordersListHtml = "";
    siblingOrders.forEach((ord) => {
      ordersListHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px; font-weight: bold; font-family: monospace; color: #2563eb;">${ord.ORDER_ID || ord.orderId}</td>
          <td style="padding: 6px;">${ord.PCN_ID || ord.pcnId}</td>
          <td style="padding: 6px;">${ord.WIDTH || ord.width}W x ${ord.CELLS || ord.cells}C</td>
        </tr>`;
    });

    let layoutGraphicHtml = `
      <div style="position: relative; width: 100%; height: 320px; background: #0f172a; border: 2px solid #475569; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; padding: 4px; gap: 4px;">
        
        <!-- BLOQUE SUPERIOR (ÓRDENES + SUB-REMANENTE LATERAL) -->
        <div style="display: flex; width: 100%; height: ${Math.min(usedCellsPct, 100)}%; gap: 4px; overflow: hidden;">
          
          <!-- COLUMNA DE ÓRDENES -->
          <div style="width: ${Math.min(usedWidthPct, 100)}%; height: 100%; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; gap: 2px;">`;

    siblingOrders.forEach((ord, idx) => {
      const w = Number(ord.WIDTH || ord.width);
      const c = Number(ord.CELLS || ord.cells);
      const pieceDimension = isVertical ? c : w;
      const totalDimension = isVertical ? sumOrdersC : sumOrdersW;
      const pct = (pieceDimension / totalDimension) * 100 || 0;
      const bg = colors[idx % colors.length];

      const pieceStyle = isVertical ? `width: 100%; height: ${pct}%;` : `width: ${pct}%; height: 100%;`;

      layoutGraphicHtml += `
        <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.8rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; border-radius: 2px;" title="${ord.ORDER_ID}">
          <span><b>${ord.ORDER_ID || ord.orderId}</b></span>
          <span style="font-size: 0.72rem; opacity: 0.9;">${w}W x ${c}C</span>
        </div>`;
    });

    layoutGraphicHtml += `</div>`;

    // SUB-REMANENTE LATERAL (SUB1)
    const latPct = Math.max(0, 100 - usedWidthPct);
    if (subLateral) {
      const subId = subLateral.SUB_MATERIAL_ID || subLateral.subMaterialId;
      const w = subLateral.WIDTH || subLateral.width;
      const c = subLateral.CELLS || subLateral.cells;
      const isSaved = subLateral.statusConfirmation === 'SALVADO';
      const bgStyle = isSaved ? 'background: #334155; border: 2px dashed #38bdf8;' : 'background: #7f1d1d; border: 2px dashed #fca5a5;';
      const badgeText = isSaved ? '✅ SALVADO' : '❌ NO SALVADO';

      layoutGraphicHtml += `
        <div onclick="CutterView.openSubConfirmationModal('${subId}')" style="width: ${latPct}%; height: 100%; ${bgStyle} border-radius: 4px; color: #ffffff; font-size: 0.8rem; font-weight: bold; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 6px; cursor: pointer;" title="Haz clic para cambiar estatus">
          <span style="color: #38bdf8; font-family: monospace;">✂️ ${subId}</span>
          <span style="font-size: 0.75rem; color: #cbd5e1;">${w}W x ${c}C</span>
          <span style="font-size: 0.65rem; margin-top: 4px; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 3px;">${badgeText}</span>
        </div>`;
    } else if (latPct > 0) {
      layoutGraphicHtml += `
        <div style="width: ${latPct}%; height: 100%; background: #0f172a; opacity: 0.5; color: #94a3b8; font-size: 0.7rem; display: flex; justify-content: center; align-items: center;">
          Merma (${latPct.toFixed(0)}%)
        </div>`;
    }

    layoutGraphicHtml += `</div>`;

    // SUB-REMANENTE INFERIOR (SUB2 O SUB1)

    
    const bottomPct = Math.max(0, 100 - usedCellsPct);
    if (subBottom) {
      const subId = subBottom.SUB_MATERIAL_ID || subBottom.subMaterialId;
      const w = subBottom.WIDTH || subBottom.width;
      const c = subBottom.CELLS || subBottom.cells;
      const isSaved = subBottom.statusConfirmation === 'SALVADO';
      const bgStyle = isSaved ? 'background: #334155; border: 2px dashed #38bdf8;' : 'background: #7f1d1d; border: 2px dashed #fca5a5;';
      const badgeText = isSaved ? '✅ SALVADO' : '❌ NO SALVADO';

      layoutGraphicHtml += `
        <div onclick="CutterView.openSubConfirmationModal('${subId}')" style="width: 100%; height: ${bottomPct}%; ${bgStyle} border-radius: 4px; color: #ffffff; font-size: 0.8rem; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 10px; cursor: pointer;" title="Haz clic para cambiar estatus">
          <span style="color: #38bdf8; font-family: monospace;">✂️ ${subId}</span>
          <span style="font-size: 0.75rem; color: #cbd5e1;">(${w}W x ${c}C)</span>
          <span style="font-size: 0.65rem; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 3px;">${badgeText}</span>
        </div>`;
    } else if (bottomPct > 0) {
      layoutGraphicHtml += `
        <div style="width: 100%; height: ${bottomPct}%; background: #0f172a; opacity: 0.5; color: #94a3b8; font-size: 0.7rem; display: flex; justify-content: center; align-items: center;">
          Merma (${bottomPct.toFixed(0)}%)
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

          <h4 style="font-size: 0.85rem; color: #16a34a; margin-bottom: 8px;">Órdenes a Cortar (${siblingOrders.length})</h4>
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
            💾 Guardar y Finalizar Corte
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

    const modalHtml = `
      <div id="modal-sub-confirm-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 480px; border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <h3 style="margin-top: 0; color: #1e293b;">✂️ Confirmación de Sobrante</h3>
          <p style="font-size: 0.9rem; color: #475569;">
            ¿Se recuperó físicamente con éxito el sobrante <b>${subMaterialId}</b>?
          </p>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button class="btn btn-outline-danger" onclick="CutterView.setSubStatus('${subMaterialId}', 'NO_SALVADO')">
              ❌ No, se dañó / descartó
            </button>
            <button class="btn btn-success" onclick="CutterView.setSubStatus('${subMaterialId}', 'SALVADO')">
              ✅ Sí, sobrante salvado
            </button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-sub-confirm-popup");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  function setSubStatus(subMaterialId, status) {
    const modal = document.getElementById("modal-sub-confirm-popup");
    if (modal) modal.remove();

    if (currentLayoutData) {
      let sub = currentLayoutData.subRemanents.find(s => 
        String(s.SUB_MATERIAL_ID || s.subMaterialId) === subMaterialId
      );

      if (!sub) {
        sub = {
          SUB_MATERIAL_ID: subMaterialId,
          statusConfirmation: status
        };
        currentLayoutData.subRemanents.push(sub);
      } else {
        sub.statusConfirmation = status;
      }

      App.showToast(`Estatus del sobrante ${subMaterialId} cambiado a: ${status}`, "info");
      renderLayoutGraphic();
    }
  }

  async function saveCutConfirmation() {
    if (!currentLayoutData) return;

    const { parentMatId, subRemanents } = currentLayoutData;
    
    // Obtener la sesión activa directamente desde AuthService
    const session = AuthService.getSession();
    const currentUserEmail = (session && session.user && session.user.email) ? session.user.email : "OPERADOR_CORTE";

    const updates = subRemanents.map(sub => ({
      subMaterialId: sub.SUB_MATERIAL_ID || sub.subMaterialId,
      statusConfirmation: sub.statusConfirmation || 'SALVADO'
    }));

    App.showLoader("Guardando estatus de sobrantes y operador...");

    try {
      const res = await GasAPI.send("confirmCutterSobrantes", {
        parentMaterialId: parentMatId,
        operatorEmail: currentUserEmail,
        updates: updates
      });

      App.hideLoader();

      if (res && res.success) {
        App.showToast("Corte procesado correctamente con estatus y trazabilidad registradas.", "success");
        await App.refreshDatabase();
        render(document.getElementById("cutter-view"));
      } else {
        App.showToast("Error guardando confirmación: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error en la comunicación con la base de datos: " + err.message, "error");
    }
  }

  return {
    render: render,
    lookupLayout: lookupLayout,
    openSubConfirmationModal: openSubConfirmationModal,
    setSubStatus: setSubStatus,
    saveCutConfirmation: saveCutConfirmation
  };
})();
