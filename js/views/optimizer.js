/**
 * Frontend - Vista para Rol Optimización / Manual (Reasignación & Standby)
 * Archivo: js/views/optimizer.js
 */

const OptimizerView = (function () {
  let selectedMaterialOverride = null;

  function render(container) {
    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2>Reasignación Manual y Gestión de Standby</h2>
          <p class="text-muted">Busca sobrantes manualmente para órdenes específicas o envíalas a Standby.</p>
        </div>
        <div>
          <button type="button" class="btn btn-outline-primary" onclick="OptimizerView.openAssignmentsModal()">
            📋 Ver Asignaciones Realizadas
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <!-- PANEL DE REASIGNACIÓN -->
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <h3>Formulario de Reasignación</h3>
          <hr style="margin: 12px 0;">

          <form id="form-reassign" onsubmit="return false;">
            <div class="form-group" style="margin-bottom: 12px;">
              <label>ORDER_ID a Consultar / Reasignar</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="re-order-id" class="form-control" placeholder="Ej: 00123456780000100001" required>
                <button type="button" class="btn btn-info" onclick="OptimizerView.lookupOrderId()">
                  🔍 Buscar
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label>PCN_ID</label>
              <input type="text" id="re-pcn" class="form-control" placeholder="Ej: 1019594" required>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
              <div class="form-group">
                <label>WIDTH (Ancho)</label>
                <input type="number" id="re-width" class="form-control" placeholder="30" required>
              </div>
              <div class="form-group">
                <label>CELLS (Celdas)</label>
                <input type="number" id="re-cells" class="form-control" placeholder="25" required>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
              <label>Motivo de Reasignación</label>
              <select id="re-reason" class="form-control">
                <option value="REASIGNACION_MANUAL">Reasignación Manual Preferente</option>
                <option value="CAMBIO_DE_MEDIDAS">Ajuste / Cambio de Medidas</option>
                <option value="RECHAZO_MATERIAL">Rechazo de Material Previo</option>
                <option value="URGENCIA_PRODUCCION">Urgencia de Producción</option>
              </select>
            </div>

            <!-- SOBRANTE SELECCIONADO MANUALMENTE -->
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; font-weight: bold;">Sobrante Destino:</span>
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="OptimizerView.openSearchModal()">
                  🔍 Seleccionar de tbInventario
                </button>
              </div>
              <div id="selected-material-display" style="margin-top: 8px; font-size: 0.8rem; color: #475569;">
                <i>Selección automática si se deja en blanco.</i>
              </div>
            </div>

            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-primary" style="flex: 1;" onclick="OptimizerView.executeReassignment()">
                🔄 Procesar Reasignación
              </button>
              <button type="button" class="btn btn-outline-warning" onclick="OptimizerView.sendToStandbyDirectly()">
                ⏳ Enviar a Standby
              </button>
            </div>
          </form>
        </div>

        <!-- PANEL DE REGISTRO EN STANDBY -->
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3>Órdenes en Standby</h3>
            <button type="button" class="btn btn-sm btn-success" onclick="OptimizerView.exportStandbyToCSV()">
              📥 Exportar Standby a CSV
            </button>
          </div>
          <hr style="margin-bottom: 16px;">

          <div id="standby-table-container">
            <p style="color: #64748b; font-style: italic;">Cargando registros de Standby...</p>
          </div>
        </div>
      </div>
    `;

    renderStandbyTable();
  }

  // --- REBÚSQUEDA AUTOMÁTICA AL INGRESAR ORDER_ID ---
  function lookupOrderId() {
    const orderId = document.getElementById("re-order-id").value.trim();
    if (!orderId) {
      return App.showToast("Ingresa un ORDER_ID para consultar.", "warning");
    }

    const assignments = App.getDbTable("tbAsignaciones") || [];
    const standbyList = App.getDbTable("tbStandby") || [];

    // Buscar coincidencia en tbAsignaciones o tbStandby
    const matchAssign = assignments.find(a => String(a.ORDER_ID || a.orderId).trim() === orderId);
    const matchStandby = standbyList.find(s => String(s.ORDER_ID || s.orderId).trim() === orderId && s.STATUS !== "RESOLVED" && s.STATUS !== "ELIMINADO");

    const match = matchAssign || matchStandby;

    if (match) {
      const sourceTable = matchAssign ? "tbAsignaciones" : "tbStandby";
      const pcn = match.PCN_ID || match.pcnId || "";
      const width = match.WIDTH || match.width || 0;
      const cells = match.CELLS || match.cells || 0;

      // Autocompletar formulario principal
      document.getElementById("re-pcn").value = pcn;
      document.getElementById("re-width").value = width;
      document.getElementById("re-cells").value = cells;

      // Mostrar Modal con los datos encontrados y opción de reasignación directa
      showMatchFoundPopup(match, sourceTable);
    } else {
      App.showToast(`No se encontró registro para el ORDER_ID ${orderId}. Se continuará como nueva asignación.`, "info");
    }
  }

  // --- POP-UP DE COINCIDENCIA ENCONTRADA ---
  function showMatchFoundPopup(matchData, sourceTable) {
    const existing = document.getElementById("modal-match-found");
    if (existing) existing.remove();

    const orderId = matchData.ORDER_ID || matchData.orderId || "";
    const pcn = matchData.PCN_ID || matchData.pcnId || "";
    const width = matchData.WIDTH || matchData.width || 0;
    const cells = matchData.CELLS || matchData.cells || 0;
    const currentMat = matchData.MATERIAL_ID || matchData["MATERIAL ID"] || matchData.materialId || "N/A";

    const modalHtml = `
      <div id="modal-match-found" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 650px; border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
            <h3 style="margin: 0; color: #1e293b;">Coincidencia Encontrada en ${sourceTable}</h3>
            <button type="button" onclick="document.getElementById('modal-match-found').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>

          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 16px; font-size: 0.85rem;">
            <p style="margin: 4px 0;"><strong>ORDER_ID:</strong> <span style="font-family: monospace; color: #2563eb;">${orderId}</span></p>
            <p style="margin: 4px 0;"><strong>PCN_ID:</strong> ${pcn} | <strong>Medidas:</strong> ${width}W x ${cells}C</p>
            <p style="margin: 4px 0;"><strong>Sobrante Actual:</strong> ${currentMat}</p>
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label style="font-size: 0.85rem; font-weight: bold;">Motivo de Reasignación</label>
            <select id="modal-re-reason" class="form-control">
              <option value="REASIGNACION_MANUAL">Reasignación Manual Preferente</option>
              <option value="CAMBIO_DE_MEDIDAS">Ajuste / Cambio de Medidas</option>
              <option value="RECHAZO_MATERIAL">Rechazo de Material Previo</option>
              <option value="URGENCIA_PRODUCCION">Urgencia de Producción</option>
            </select>
          </div>

          <div style="text-align: right; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-match-found').remove()">Cerrar</button>
            <button type="button" class="btn btn-primary" onclick="OptimizerView.openSearchModalFromPopup('${orderId}', '${pcn}', ${width}, ${cells})">🔍 Buscar Nuevo Sobrante</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  function openSearchModalFromPopup(orderId, pcn, width, cells) {
    const reasonSelect = document.getElementById("modal-re-reason");
    if (reasonSelect) {
      document.getElementById("re-reason").value = reasonSelect.value;
    }
    const modal = document.getElementById("modal-match-found");
    if (modal) modal.remove();

    openSearchModal();
  }

  // --- RENDERIZAR TABLA DE STANDBY CON ELIMINACIÓN ---
  function renderStandbyTable() {
    const container = document.getElementById("standby-table-container");
    if (!container) return;

    const standbyList = App.getDbTable("tbStandby") || [];
    const activeStandby = standbyList.filter((s) => s.STATUS !== "RESOLVED" && s.STATUS !== "ELIMINADO");

    if (activeStandby.length === 0) {
      container.innerHTML = `<p style="color: #64748b; font-style: italic;">No hay órdenes pendientes en Standby.</p>`;
      return;
    }

    let html = `
      <div style="max-height: 420px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left; position: sticky; top: 0; z-index: 1;">
              <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ORDER_ID</th>
              <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">PCN_ID</th>
              <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MEDIDAS</th>
              <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MOTIVO</th>
              <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ACCIÓN</th>
            </tr>
          </thead>
          <tbody>`;

    activeStandby.forEach((row) => {
      const orderId = String(row.ORDER_ID || row.orderId || "N/A");
      const pcnId = row.PCN_ID || row.pcnId || "N/A";
      const width = row.WIDTH || row.width || "0";
      const cells = row.CELLS || row.cells || "0";
      const reason = row.REASON || row.reason || "STANDBY";

      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #2563eb;">${orderId}</td>
          <td style="padding: 8px;">${pcnId}</td>
          <td style="padding: 8px;">${width}W x ${cells}C</td>
          <td style="padding: 8px;"><span class="badge" style="background: #fef3c7; color: #b45309;">${reason}</span></td>
          <td style="padding: 8px;">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="OptimizerView.deleteStandbyGroup('${orderId}')">
              🗑️ Eliminar
            </button>
          </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  // --- ELIMINACIÓN DE ÓRDENES Y SUS COINCIDENCIAS (10 PRIMEROS DÍGITOS) ---
  async function deleteStandbyGroup(targetOrderId) {
    const prefix = String(targetOrderId).substring(0, 10);
    if (!confirm(`¿Deseas eliminar la orden ${targetOrderId} y todas sus coincidencias pertenecientes al lote (${prefix}) en Standby?`)) {
      return;
    }

    App.showLoader("Eliminando órdenes en Standby...");

    try {
      const res = await GasAPI.send("deleteStandbyGroup", { prefix10: prefix });
      App.hideLoader();

      if (res && res.success) {
        App.showToast(`Órdenes asociadas al lote ${prefix} eliminadas de Standby.`, "success");
        await App.refreshDatabase();
        renderStandbyTable();
      } else {
        App.showToast("Error al eliminar registros: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error de conexión: " + err.message, "error");
    }
  }

  // --- BÚSQUEDA Y SELECCIÓN DE SOBRANTE ---
  function openSearchModal() {
    const orderId = document.getElementById("re-order-id").value.trim();
    const pcn = document.getElementById("re-pcn").value.trim();
    const width = Number(document.getElementById("re-width").value) || 0;
    const cells = Number(document.getElementById("re-cells").value) || 0;

    if (!orderId || !pcn || !width || !cells) {
      return App.showToast("Ingresa ORDER_ID, PCN_ID, WIDTH y CELLS antes de buscar un sobrante.", "warning");
    }

    const minW = width + (CONFIG.MARGINS?.WIDTH || 2);
    const minC = cells + (CONFIG.MARGINS?.CELLS || 5);

    const rawInv = App.getDbTable("tbInventario") || [];
    const candidates = rawInv.filter(m => 
      m.STATUS !== 'ELIMINADO' && 
      m.STATUS !== 'ASIGNADO' &&
      String(m.PCN_ID).trim() === pcn &&
      Number(m.WIDTH) >= minW &&
      Number(m.CELLS) >= minC
    );

    if (candidates.length === 0) {
      return App.showToast(`No se encontraron sobrantes disponibles para PCN ${pcn} (${minW}W x ${minC}C).`, "info");
    }

    showCandidatesPopup(candidates, { orderId, pcn, width, cells, minW, minC });
  }

  function showCandidatesPopup(candidates, params) {
    const existingModal = document.getElementById("modal-search-remanente");
    if (existingModal) existingModal.remove();

    let rowsHtml = candidates.map(c => {
      const matId = c["MATERIAL_ID"] || c["MATERIAL ID"] || c.materialId;
      const rack = c.RACK || c.rack || "N/A";
      const loc = c.LOC || c.loc || "N/A";
      const w = c.WIDTH || 0;
      const cl = c.CELLS || 0;
      const status = c.STATUS || "DISPONIBLE";

      const itemJson = JSON.stringify(c).replace(/"/g, '&quot;');

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 0.85rem;">
          <td style="padding: 8px; font-weight: bold; color: #0284c7;">${matId}</td>
          <td style="padding: 8px;">${w} W x ${cl} C</td>
          <td style="padding: 8px;">RACK: ${rack} | LOC: ${loc}</td>
          <td style="padding: 8px;"><span class="badge" style="background: #dcfce7; color: #166534;">${status}</span></td>
          <td style="padding: 8px; text-align: center;">
            <button type="button" class="btn btn-primary" style="padding: 3px 10px; font-size: 0.75rem;" onclick="OptimizerView.selectMaterialFromModal('${itemJson}')">
              Seleccionar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const modalHtml = `
      <div id="modal-search-remanente" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 700px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">Sobrantes Compatibles en Inventario</h3>
            <button type="button" onclick="document.getElementById('modal-search-remanente').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>
          <p style="font-size: 0.85rem; color: #64748b; margin-top: 0;">
            Orden: <strong>${params.orderId}</strong> | PCN: <strong>${params.pcn}</strong> | Requerido: <strong>${params.minW}W x ${params.minC}C</strong>
          </p>
          
          <div style="overflow-y: auto; flex: 1; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 15px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8fafc; text-align: left; border-bottom: 2px solid #e2e8f0; font-size: 0.8rem;">
                  <th style="padding: 8px;">MATERIAL_ID</th>
                  <th style="padding: 8px;">MEDIDAS</th>
                  <th style="padding: 8px;">UBICACIÓN</th>
                  <th style="padding: 8px;">ESTATUS</th>
                  <th style="padding: 8px; text-align: center;">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div style="text-align: right;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-search-remanente').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function selectMaterialFromModal(jsonStr) {
    try {
      const material = JSON.parse(jsonStr);
      selectedMaterialOverride = material;
      updateMaterialDisplay();

      const modal = document.getElementById("modal-search-remanente");
      if (modal) modal.remove();

      const matId = material["MATERIAL_ID"] || material["MATERIAL ID"] || material.materialId;
      App.showToast(`Sobrante ${matId} asignado.`, "success");
    } catch (e) {
      console.error("Error seleccionando material:", e);
    }
  }

  function updateMaterialDisplay() {
    const display = document.getElementById("selected-material-display");
    if (!display) return;

    if (selectedMaterialOverride) {
      const matId = selectedMaterialOverride["MATERIAL_ID"] || selectedMaterialOverride["MATERIAL ID"] || selectedMaterialOverride.materialId;
      display.innerHTML = `
        <span style="color: #16a34a; font-weight: bold;">
          ✓ Seleccionado: <b>${matId}</b> (${selectedMaterialOverride.WIDTH}W x ${selectedMaterialOverride.CELLS}C) - Ubic: ${selectedMaterialOverride.RACK || 'N/A'}-${selectedMaterialOverride.LOC || 'N/A'}
        </span>
        <button type="button" class="btn btn-sm btn-outline-danger" style="margin-left: 8px; padding: 1px 6px; font-size: 0.7rem;" onclick="OptimizerView.clearMaterialOverride()">Quitar</button>
      `;
    } else {
      display.innerHTML = `<i>Selección automática si se deja en blanco.</i>`;
    }
  }

  function clearMaterialOverride() {
    selectedMaterialOverride = null;
    updateMaterialDisplay();
  }

  // --- EJECUTAR REASIGNACIÓN ---
  async function executeReassignment() {
    const orderId = document.getElementById("re-order-id").value.trim();
    const pcn = document.getElementById("re-pcn").value.trim();
    const width = Number(document.getElementById("re-width").value);
    const cells = Number(document.getElementById("re-cells").value);
    const reason = document.getElementById("re-reason").value;

    if (!orderId || !pcn || !width || !cells) {
      return App.showToast("Completa los parámetros de la orden a reasignar.", "error");
    }

    let targetMaterialId = null;
    let rack = "";
    let loc = "";

    if (selectedMaterialOverride) {
      targetMaterialId = selectedMaterialOverride["MATERIAL_ID"] || selectedMaterialOverride["MATERIAL ID"] || selectedMaterialOverride.materialId;
      rack = selectedMaterialOverride.RACK || selectedMaterialOverride.rack || "";
      loc = selectedMaterialOverride.LOC || selectedMaterialOverride.loc || "";
    } else {
      const rawInv = App.getDbTable("tbInventario") || [];
      const candidates = rawInv.filter(
        (m) =>
          m.STATUS !== "ELIMINADO" &&
          m.STATUS !== "ASIGNADO" &&
          String(m.PCN_ID).trim() === pcn &&
          Number(m.WIDTH) >= width + (CONFIG.MARGINS?.WIDTH || 2) &&
          Number(m.CELLS) >= cells + (CONFIG.MARGINS?.CELLS || 5)
      );

      if (candidates.length > 0) {
        targetMaterialId = candidates[0]["MATERIAL_ID"] || candidates[0]["MATERIAL ID"];
        rack = candidates[0].RACK || candidates[0].rack || "";
        loc = candidates[0].LOC || candidates[0].loc || "";
      }
    }

    App.showLoader("Procesando reasignación...");
    const todayStr = new Date().toISOString().split("T")[0];

    const payload = {
      orderId: orderId,
      pcnId: pcn,
      width: width,
      cells: cells,
      reason: reason,
      targetMaterialId: targetMaterialId,
      rack: rack,
      loc: loc,
      reassignDate: todayStr,
    };

    try {
      const res = await GasAPI.send("reassignOrder", payload);
      App.hideLoader();

      if (res && res.success) {
        if (res.reassigned) {
          App.showToast(`Éxito: Orden reasignada al sobrante ${targetMaterialId}`, "success");
        } else {
          App.showToast("No se encontró sobrante. El lote fue enviado a Standby y sobrantes devueltos a AUDITADO.", "info");
        }

        document.getElementById("form-reassign").reset();
        selectedMaterialOverride = null;
        updateMaterialDisplay();

        await App.refreshDatabase();
        renderStandbyTable();
      } else {
        App.showToast("Error en reasignación: " + (res ? res.message : "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error de conexión al procesar la reasignación: " + err.message, "error");
    }
  }

  // --- ENVIAR A STANDBY DIRECTAMENTE (FORZADO SIN SOBRANTE) ---
  async function sendToStandbyDirectly() {
    const orderId = document.getElementById("re-order-id").value.trim();
    const pcn = document.getElementById("re-pcn").value.trim();
    const width = Number(document.getElementById("re-width").value);
    const cells = Number(document.getElementById("re-cells").value);
    const reason = document.getElementById("re-reason").value;

    if (!orderId || !pcn || !width || !cells) {
      return App.showToast("Ingresa los datos de la orden para enviarla a Standby.", "error");
    }

    App.showLoader("Enviando lote a Standby y liberando sobrantes...");
    const todayStr = new Date().toISOString().split("T")[0];

    const payload = {
      orderId: orderId,
      pcnId: pcn,
      width: width,
      cells: cells,
      reason: "ENVIO_DIRECTO_STANDBY: " + reason,
      targetMaterialId: null,
      rack: "",
      loc: "",
      reassignDate: todayStr,
    };

    try {
      const res = await GasAPI.send("reassignOrder", payload);
      App.hideLoader();

      if (res && res.success) {
        App.showToast("Lote enviado a Standby y sobrantes liberados con éxito.", "success");
        document.getElementById("form-reassign").reset();
        selectedMaterialOverride = null;
        updateMaterialDisplay();

        await App.refreshDatabase();
        renderStandbyTable();
      } else {
        App.showToast("Error al enviar a Standby: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error de comunicación: " + err.message, "error");
    }
  }

  // --- POP-UP DE CONSULTA DE ASIGNACIONES REALIZADAS ---
  function openAssignmentsModal() {
    const assignments = App.getDbTable("tbAsignaciones") || [];

    let tableContent = "";
    if (assignments.length === 0) {
      tableContent = `<p style="color: #64748b; text-align: center; padding: 20px;">No hay registros guardados en tbAsignaciones.</p>`;
    } else {
      tableContent = `
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left; position: sticky; top: 0; z-index: 1;">
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MATERIAL_ID</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">FECHA ASIGNACIÓN</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ORDER_ID</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">PCN_ID</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">UBICACIÓN</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MEDIDAS</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ESTATUS</th>
              </tr>
            </thead>
            <tbody>`;

      assignments.forEach((row) => {
        const matId = row["MATERIAL ID"] || row.MATERIAL_ID || row.materialId || "N/A";
        const fecha = row.FECHA_ASIGNACION || row.FECHA || "N/A";
        const orderId = String(row.ORDER_ID || row.orderId || "N/A");
        const pcnId = row.PCN_ID || row.pcnId || "N/A";
        const rack = row.RACK || row.rack || "N/A";
        const loc = row.LOC || row.loc || "N/A";
        const width = row.WIDTH || row.width || "0";
        const cells = row.CELLS || row.cells || "0";
        const status = row.STATUS || row.status || "ASIGNADO";

        tableContent += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #2563eb;">${matId}</td>
            <td style="padding: 8px;">${fecha}</td>
            <td style="padding: 8px; font-weight: bold; font-family: monospace;">${orderId}</td>
            <td style="padding: 8px;">${pcnId}</td>
            <td style="padding: 8px;">${rack}-${loc}</td>
            <td style="padding: 8px;">${width}W x ${cells}C</td>
            <td style="padding: 8px;"><span class="badge" style="background: #e0f2fe; color: #0369a1;">${status}</span></td>
          </tr>`;
      });

      tableContent += `
            </tbody>
          </table>
        </div>`;
    }

    const modalHtml = `
      <div id="modal-assignments-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 900px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">Historial de Asignaciones en tbAsignaciones</h3>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-success" style="font-size: 0.8rem;" onclick="ValidatorView.exportAssignmentsToCSV()">
                📥 Exportar a CSV
              </button>
              <button type="button" onclick="document.getElementById('modal-assignments-popup').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
          </div>
          
          ${tableContent}

          <div style="text-align: right; margin-top: 15px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-assignments-popup').remove()">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-assignments-popup");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  // --- EXPORTAR REGISTROS DE STANDBY A CSV ---
  function exportStandbyToCSV() {
    const standbyList = App.getDbTable("tbStandby") || [];
    const activeStandby = standbyList.filter((s) => s.STATUS !== "RESOLVED" && s.STATUS !== "ELIMINADO");

    if (activeStandby.length === 0) {
      App.showToast("No hay datos en Standby para exportar.", "warning");
      return;
    }

    const headers = ["ORDER_ID", "PCN_ID", "WIDTH", "CELLS", "REASON", "FECHA_STANDBY", "STATUS"];

    let csvContent = "\uFEFF";
    csvContent += headers.join(",") + "\r\n";

    activeStandby.forEach((row) => {
      const orderId = String(row.ORDER_ID || row.orderId || "");
      const pcnId = String(row.PCN_ID || row.pcnId || "");
      const width = row.WIDTH || row.width || "0";
      const cells = row.CELLS || row.cells || "0";
      const reason = row.REASON || row.reason || "";
      const fecha = row.FECHA_STANDBY || row.FECHA || row.orderDate || "";
      const status = row.STATUS || row.status || "STANDBY";

      const formattedOrderId = orderId ? `="${orderId}"` : '""';
      const formattedPcnId = pcnId ? `="${pcnId}"` : '""';

      const line = [
        formattedOrderId,
        formattedPcnId,
        width,
        cells,
        `"${reason}"`,
        `"${fecha}"`,
        `"${status}"`,
      ].join(",");

      csvContent += line + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `Reporte_Standby_${dateStr}.csv`);
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    App.showToast("Archivo CSV de Standby exportado con éxito.", "success");
  }

  return {
    render: render,
    lookupOrderId: lookupOrderId,
    openSearchModalFromPopup: openSearchModalFromPopup,
    openSearchModal: openSearchModal,
    selectMaterialFromModal: selectMaterialFromModal,
    clearMaterialOverride: clearMaterialOverride,
    executeReassignment: executeReassignment,
    sendToStandbyDirectly: sendToStandbyDirectly,
    deleteStandbyGroup: deleteStandbyGroup,
    openAssignmentsModal: openAssignmentsModal,
    exportStandbyToCSV: exportStandbyToCSV,
    renderStandbyTable: renderStandbyTable,
  };
})();