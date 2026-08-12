/**
 * Frontend - Módulo Optimizador
 * Archivo: js/views/optimizer.js
 */

const OptimizerView = (function () {
  let searchOrderFilterQuery = "";

  let autoRefreshTimer = null;

  function render(container) {
    const target = container || document.getElementById("main-content");
    target.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px;">
        <h2>Panel de Control del Optimizador</h2>
        <p class="text-muted">Reparte los remanentes para recolección a los Pickers de forma individual o masiva y gestiona reasignaciones por falta de material.</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <!-- PANEL 1: REPARTIR MATERIALES ACTIVADOS MASIVAMENTE O INDIVIDUAL -->
        <div class="card" style="background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #cbd5e1;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3 style="margin: 0; color: #1e293b;">📋 Asignar Rutas a Pickers</h3>
            <label style="font-size: 0.8rem; color: #2563eb; cursor: pointer; display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="chk-select-all-parents" onchange="OptimizerView.toggleSelectAllParents(this.checked)">
              <b>Seleccionar Todos</b>
            </label>
          </div>
          <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 12px;">
            Filtra por orden, marca los sobrantes a repartir, ingresa el ID del recolector y asigna en lote.
          </p>

          <!-- FILTRO POR ORDER_ID -->
          <div style="margin-bottom: 10px;">
            <div style="display: flex; gap: 6px;">
              <input type="text" id="input-filter-order-opt" class="form-control" 
                placeholder="Shopfloor id..." 
                value="${searchOrderFilterQuery}"
                oninput="OptimizerView.onOrderFilterInput(this.value)"
                style="font-family: monospace; font-size: 0.85rem; height: 36px;">
              <button type="button" class="btn btn-outline-secondary btn-sm" onclick="OptimizerView.clearOrderFilter()">Limpiar</button>
            </div>
          </div>

          <!-- BARRA DE ASIGNACIÓN MASIVA -->
          <div style="display: flex; gap: 8px; background: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 14px;">
            <input type="text" id="input-picker-global" class="form-control" placeholder="ID Picker(Ej: 0#####A)" 
              style="font-size: 0.9rem; font-family: monospace; text-transform: uppercase; height: 38px;">
            <button type="button" class="btn btn-primary" style="font-weight: bold; white-space: nowrap; height: 38px;" 
              onclick="OptimizerView.assignSelectedToPicker()">
                Asignar Seleccionados
            </button>
          </div>

          <div id="container-opt-activated"></div>
        </div>

        <!-- PANEL 2: NOTIFICACIONES Y REPROCESAMIENTO DE STANDBY -->
        <div class="card" style="background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #fca5a5;">
          <h3 style="margin-top: 0; color: #991b1b;">⚠️ Ordenes pendientes (Standby)</h3>
          <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 12px;">
            Órdenes reportadas por falta de material (sobrante ausente o dañado). Presiona "Reasignar" para volver a buscar un remanente.
          </p>
          <div id="container-opt-standby"></div>
        </div>
      </div>
    `;

    renderActivatedGroups();
    renderStandbyAlerts();

    startAutoRefresh();
  }

  // 🔄 CONFIGURACIÓN DEL REFRESO AUTOMÁTICO DE DATO (60 SEGUNDOS)
  function startAutoRefresh() {
    stopAutoRefresh(); // Detener instancias previas para evitar duplicados
    autoRefreshTimer = setInterval(async () => {
      // Evitar refrescar si hay un modal o pop-up abierto
      if (document.getElementById("modal-reassign-opt")) return;

      if (typeof App.refreshDatabase === "function") {
        await App.refreshDatabase();
        renderActivatedGroups();
        renderStandbyAlerts();
      }
    }, 20000); // 60,000 ms = 1 Minuto
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  function renderActivatedGroups() {
    const container = document.getElementById("container-opt-activated");
    if (!container) return;

    const assignments = App.getDbTable("tbAsignaciones") || [];
    const activeAssignments = assignments.filter(a => String(a.STATUS || a.status || "").trim().toUpperCase() === "ACTIVADO");

    // Agrupar por Sobrante Padre e incluir sus órdenes
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

    // Aplicar Filtro por ORDER_ID o PADRE
    if (searchOrderFilterQuery) {
      const cleanQ = searchOrderFilterQuery.toLowerCase();
      groupsList = groupsList.filter(g => {
        const matchParent = g.parentMaterialId.toLowerCase().includes(cleanQ);
        const matchOrder = g.orders.some(o => String(o.ORDER_ID || o.orderId || "").toLowerCase().includes(cleanQ));
        return matchParent || matchOrder;
      });
    }

    if (groupsList.length === 0) {
      container.innerHTML = `<p style="color: #64748b; font-style: italic; text-align: center; padding: 20px;">
        ${searchOrderFilterQuery ? `No hay sobrantes activados que contengan la orden "${searchOrderFilterQuery}".` : 'No hay materiales activados pendientes por asignar a Pickers.'}
      </p>`;
      return;
    }

    let html = `<div style="max-height: 380px; overflow-y: auto;">`;
    groupsList.forEach(g => {
      let ordersListHtml = "";
      g.orders.forEach(o => {
        const ordId = String(o.ORDER_ID || o.orderId || "N/A");
        const w = o.WIDTH || o.width || 0;
        const c = o.CELLS || o.cells || 0;
        const isMatch = searchOrderFilterQuery && ordId.toLowerCase().includes(searchOrderFilterQuery.toLowerCase());
        const highlightStyle = isMatch ? "background: #fef08a; font-weight: bold; color: #854d0e; padding: 1px 4px; border-radius: 2px;" : "";

        ordersListHtml += `<li style="font-family: monospace; font-size: 0.78rem; margin-top: 2px;">
          <span style="${highlightStyle}"> Orden: ${ordId.slice(0,10)} | Linea: ${ordId.slice(10,16)}</span> (${w}W x ${c}C)
        </li>`;
      });

      html += `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 10px; background: #f8fafc; display: flex; align-items: flex-start; gap: 10px;">
          <div style="margin-top: 2px;">
            <input type="checkbox" class="chk-parent-item" value="${g.parentMaterialId}" style="width: 18px; height: 18px; cursor: pointer;">
          </div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <strong style="font-family: monospace; color: #2563eb; font-size: 0.95rem;">ID Remanente: ${g.parentMaterialId}</strong>
              <span class="badge" style="background: #0284c7; color: #fff; font-size: 0.75rem;">Locación: ${g.rack}-${g.loc}</span>
            </div>
            <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
              <b>PCN:</b> ${g.pcnId} | <b>Órdenes (${g.orders.length}):</b>
            </div>
            <!-- LISTA DE ÓRDENES QUE PERTENECEN AL SOBRANTE -->
            <ul style="margin: 0 0 0 16px; padding: 0; color: #334155;">
              ${ordersListHtml}
            </ul>
          </div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function onOrderFilterInput(val) {
    searchOrderFilterQuery = String(val || "").trim();
    renderActivatedGroups();
  }

  function clearOrderFilter() {
    searchOrderFilterQuery = "";
    const inputEl = document.getElementById("input-filter-order-opt");
    if (inputEl) inputEl.value = "";
    renderActivatedGroups();
  }

  function toggleSelectAllParents(checked) {
    const checkboxes = document.querySelectorAll(".chk-parent-item");
    checkboxes.forEach(chk => chk.checked = checked);
  }

  async function assignSelectedToPicker() {
    const pickerInput = document.getElementById("input-picker-global");
    const pickerId = pickerInput?.value.trim().toUpperCase();

    if (!pickerId || !/^0\d{5}[A-Z]$/.test(pickerId)) {
      App.showToast("Ingresa un número de empleado válido (Ej: 012345A).", "error");
      return;
    }

    const selectedCheckboxes = document.querySelectorAll(".chk-parent-item:checked");
    const parentIds = Array.from(selectedCheckboxes).map(chk => chk.value);

    if (parentIds.length === 0) {
      App.showToast("Selecciona al menos un sobrante padre de la lista.", "warning");
      return;
    }

    App.showLoader(`Asignando ${parentIds.length} sobrante(s) a Picker ${pickerId}...`);

    try {
      let successCount = 0;
      for (const parentId of parentIds) {
        const res = await GasAPI.send("assignToPicker", {
          parentMaterialId: parentId,
          pickerId: pickerId
        });
        if (res && res.success) successCount++;
      }

      App.hideLoader();

      if (successCount > 0) {
        App.showToast(`✅ Se asignaron ${successCount} sobrante(s) exitosamente a ${pickerId}`, "success");
        if (pickerInput) pickerInput.value = "";
        await App.refreshDatabase();
        renderActivatedGroups();
      } else {
        App.showToast("No se pudo completar la asignación de los materiales.", "error");
      }
    } catch (e) {
      App.hideLoader();
      App.showToast("Error de comunicación con el servidor: " + e.message, "error");
    }
  }

  function renderStandbyAlerts() {
    const container = document.getElementById("container-opt-standby");
    if (!container) return;

    const standbyList = App.getDbTable("tbStandby") || [];
    const activeStandby = standbyList.filter(s => {
      const st = String(s.STATUS || s.status || "").trim().toUpperCase();
      return st !== "RESOLVED" && st !== "ELIMINADO";
    });

    if (activeStandby.length === 0) {
      container.innerHTML = `<p style="color: #16a34a; font-style: italic; text-align: center; padding: 20px;">🎉 No hay incidencias pendientes en Standby.</p>`;
      return;
    }

    let html = `<div style="max-height: 400px; overflow-y: auto;">`;
    activeStandby.forEach(s => {
      const ordId = String(s.ORDER_ID || s.orderId || "N/A");
      const pcnId = String(s.PCN_ID || s.pcnId || "N/A");
      const width = s.WIDTH || s.width || 0;
      const cells = s.CELLS || s.cells || 0;
      const reason = s.REASON || s.reason || "INCIDENCIA";
      const standbyId = s.STANDBY_ID || s.standbyKey || "";

      html += `
        <div style="border: 1px solid #fca5a5; background: #fef2f2; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-family: monospace; color: #dc2626; font-size: 0.9rem;">ORDEN: 00${ordId.slice(0,8)} | LINEA: ${ordId.slice(8,14)} </strong>
            <span class="badge" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;">${reason}</span>
          </div>
          <div style="font-size: 0.78rem; color: #475569; margin-bottom: 8px;">
            <b>PCN:</b> ${pcnId} | <b>Medidas:</b> ${width}W x ${cells}C
          </div>
          <button type="button" class="btn btn-sm btn-primary btn-block" style="font-weight: bold;" 
            onclick="OptimizerView.reprocessStandbyItem('${ordId}', '${pcnId}', ${width}, ${cells}, '${standbyId}')">
            Buscar remanente
          </button>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function reprocessStandbyItem(orderId, pcnId, width, cells, standbyId) {
    const rawInv = App.getDbTable("tbInventario") || [];
    
    // Filtrar sobrantes compatibles en tbInventario (Auditados, mismo PCN y que quepan las medidas)
    const matches = rawInv.filter(m => {
      const st = String(m.STATUS || m.status || "").toUpperCase();
      const pcnMatch = String(m.PCN_ID || m.pcnId || "").trim() === String(pcnId).trim();
      const wMatch = Number(m.WIDTH || m.width || 0) >= Number(width);
      const cMatch = Number(m.CELLS || m.cells || 0) >= Number(cells);
      return st !== "ELIMINADO" && pcnMatch && wMatch && cMatch;
    });

    openReassignModal({
      orderId: orderId,
      pcnId: pcnId,
      width: Number(width),
      cells: Number(cells),
      standbyId: standbyId,
      matches: matches
    });
  }

  // 1. MODAL ACTUALIZADO CON OPCIÓN DE ELIMINACIÓN
  function openReassignModal(config) {
    const bestMatch = config.matches.length > 0 ? config.matches[0] : null;

    let proposalHtml = "";
    if (bestMatch) {
      const bestMatId = bestMatch.MATERIAL_ID || bestMatch.materialId;
      proposalHtml = `
        <div style="background: #f0fdf4; border: 2px solid #22c55e; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
          <span class="badge" style="background: #22c55e; color: #fff; font-size: 0.75rem;">PROPUESTA RECOMENDADA</span>
          <div style="margin-top: 6px; font-size: 0.9rem; color: #15803d;">
            <b>Sobrante propuesto:</b> <span style="font-family: monospace; font-size: 1.05rem;">${bestMatId}</span><br>
            <b>Ubicación:</b> ${bestMatch.RACK || 'N/A'}-${bestMatch.LOC || 'N/A'} | <b>Medidas:</b> ${bestMatch.WIDTH}W x ${bestMatch.CELLS}C
          </div>
          <button type="button" class="btn btn-success btn-block" style="margin-top: 10px; font-weight: bold;" 
            onclick="OptimizerView.confirmReassignment('${config.orderId}', '${config.pcnId}', ${config.width}, ${config.cells}, '${bestMatId}', '${config.standbyId}')">
            Confirmar y reasignar
          </button>
        </div>`;
    } else {
      proposalHtml = `
        <div style="background: #fef2f2; border: 1px solid #fca5a5; padding: 12px; border-radius: 6px; margin-bottom: 16px; color: #991b1b; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            ⚠️ No se encontró sobrante compatible en inventario para <b>${config.width}W x ${config.cells}C</b>.
          </div>
          <button type="button" class="btn btn-sm btn-danger" style="font-weight: bold; white-space: nowrap;"
            onclick="OptimizerView.deleteStandbyOrder('${config.orderId}', '${config.standbyId}')">
            Eliminar orden
          </button>
        </div>`;
    }

    let matchesTableHtml = "";
    if (config.matches.length === 0) {
      matchesTableHtml = `<p style="color: #64748b; text-align: center; padding: 15px;">No hay sobrantes compatibles disponibles en tbInventario.</p>`;
    } else {
      matchesTableHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left; position: sticky; top: 0;">
              <th style="padding: 6px;">MATERIAL_ID</th>
              <th style="padding: 6px;">ESTATUS</th>
              <th style="padding: 6px;">MEDIDAS</th>
              <th style="padding: 6px;">UBICACIÓN</th>
              <th style="padding: 6px;">ACCIÓN</th>
            </tr>
          </thead>
          <tbody>`;

      config.matches.forEach(m => {
        const matId = m.MATERIAL_ID || m.materialId;
        matchesTableHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px; font-weight: bold; font-family: monospace; color: #2563eb;">${matId}</td>
            <td style="padding: 6px;"><span class="badge" style="background: #dcfce7; color: #15803d;">${m.STATUS || 'AUDITADO'}</span></td>
            <td style="padding: 6px;">${m.WIDTH}W x ${m.CELLS}C</td>
            <td style="padding: 6px;">${m.RACK || 'N/A'}-${m.LOC || 'N/A'}</td>
            <td style="padding: 6px;">
              <button class="btn btn-sm btn-outline-primary" 
                onclick="OptimizerView.confirmReassignment('${config.orderId}', '${config.pcnId}', ${config.width}, ${config.cells}, '${matId}', '${config.standbyId}')">
                Seleccionar
              </button>
            </td>
          </tr>`;
      });
      matchesTableHtml += `</tbody></table>`;
    }

    const modalHtml = `
      <div id="modal-reassign-opt" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 720px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: #1e293b;">🔄 Reasignación de Orden ${config.orderId}</h3>
            <button type="button" onclick="document.getElementById('modal-reassign-opt').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>

          <p style="font-size: 0.82rem; color: #475569; margin-bottom: 12px;">
            <b>PCN:</b> ${config.pcnId} | <b>Medidas requeridas:</b> ${config.width}W x ${config.cells}C
          </p>

          ${proposalHtml}

          <h4 style="font-size: 0.85rem; color: #1e293b; margin-bottom: 6px;">Sobrantes Compatibles en Inventario:</h4>
          <div style="flex: 1; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px;">
            ${matchesTableHtml}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <button type="button" class="btn btn-outline-danger" 
              onclick="OptimizerView.deleteStandbyOrder('${config.orderId}', '${config.standbyId}')">
              Eliminar orden de pendientes
            </button>
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-reassign-opt').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-reassign-opt");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  // 2. FUNCIÓN PARA ELIMINAR LA ORDEN DE STANDBY
  async function deleteStandbyOrder(orderId, standbyId) {
    if (!confirm(`¿Estás seguro de que deseas ELIMINAR definitivamente la orden ${orderId}?`)) return;

    App.showLoader(`Eliminando orden ${orderId}...`);

    try {
      if (standbyId) {
        await GasAPI.send("removeFromStandby", { standbyIds: [standbyId] });
      }

      App.hideLoader();
      App.showToast(`🗑️ Orden ${orderId} eliminada correctamente.`, "info");

      const modal = document.getElementById("modal-reassign-opt");
      if (modal) modal.remove();

      await App.refreshDatabase();
      render(); // Refresca las vistas
    } catch (e) {
      App.hideLoader();
      App.showToast("Error al eliminar la orden: " + e.message, "error");
    }
  }

  // 3. EJECUTAR REASIGNACIÓN Y ACTUALIZAR BD
  async function confirmReassignment(orderId, pcnId, width, cells, targetMaterialId, standbyId) {
    if (!confirm(`¿Confirmas reasignar la orden ${orderId} al sobrante ${targetMaterialId}?`)) return;

    App.showLoader(`Reasignando orden ${orderId} a sobrante ${targetMaterialId}...`);

    try {
      // Reasignación via backend (GasAPI)
      const res = await GasAPI.send("reassignOrder", {
        orderId: orderId,
        pcnId: pcnId,
        width: width,
        cells: cells,
        targetMaterialId: targetMaterialId,
        reason: "REASIGNADO_OPTIMIZER"
      });

      // Quitar registro de Standby
      if (standbyId) {
        await GasAPI.send("removeFromStandby", { standbyIds: [standbyId] });
      }

      App.hideLoader();

      if (res && res.success) {
        App.showToast(`✅ Orden ${orderId} reasignada con éxito al sobrante ${targetMaterialId}`, "success");
        
        const modal = document.getElementById("modal-reassign-opt");
        if (modal) modal.remove();

        await App.refreshDatabase();
        render(); // Refresca los paneles del optimizador
      } else {
        App.showToast("Error en reasignación: " + (res?.message || "Error desconocido"), "error");
      }

    } catch (e) {
      App.hideLoader();
      App.showToast("Error de comunicación: " + e.message, "error");
    }
  }

  return {
    render: render,
    onOrderFilterInput: onOrderFilterInput,
    clearOrderFilter: clearOrderFilter,
    toggleSelectAllParents: toggleSelectAllParents,
    assignSelectedToPicker: assignSelectedToPicker,
    reprocessStandbyItem: reprocessStandbyItem,
    confirmReassignment: confirmReassignment,
    deleteStandbyOrder: deleteStandbyOrder,
    stopAutoRefresh: stopAutoRefresh
  };
})();
