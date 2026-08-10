/**
 * Frontend - Vista para Estación de Corte con Logs de Depuración
 * Archivo: js/views/cutter.js
 */

const CutterView = (function () {
  let currentLayoutData = null;
  let pollingTimer = null; // ⏱️ Contador para el refresco de 1 minuto

  function render(container) {

    stopAutoRefresh();

    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px;">
        <h2>Estación de Corte y Liberación de Sobrantes</h2>
        <p class="text-muted">Escanea la orden 'TOMADA' para cargar su plano de corte guardado, confirmar los sobrantes físicos e imprimir etiquetas Zebra (4x1").</p>
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

    App.refreshDatabase();

    // 3. Iniciar temporizador automático de 1 minuto (60,000 ms)
    startAutoRefresh();

    setTimeout(() => {
      const input = document.getElementById("cutter-scan-input");
      if (input) input.focus();
    }, 100);

  }

  function startAutoRefresh() {
    pollingTimer = setInterval(async () => {
      // Solo refresca si la pestaña de corte sigue visible en el DOM
      const cutterSection = document.getElementById("cutter-view");
      if (cutterSection && !cutterSection.classList.contains("hidden")) {
        await App.refreshDatabase();
      } else {
        stopAutoRefresh();
      }
    }, 20000); // 60 segundos
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

    console.group("🔍 [DEBUG-CUTTER] Inicio Búsqueda de Layout");
    console.log("1. Código escaneado bruto:", rawCode);

    if (!rawCode || rawCode.length < 10) {
      App.showToast("Ingresa un código de orden válido de al menos 10 dígitos.", "warning");
      console.groupEnd();
      return;
    }

    const prefix10 = rawCode.substring(0, 10);
    const assignments = App.getDbTable("tbAsignaciones") || [];
    const subSobrantes = App.getDbTable("tbSobrantesResultantes") || [];

    console.log("2. Lote buscado (primeros 10 dígitos):", prefix10);
    console.log("3. Tabla tbAsignaciones obtenida (Total filas):", assignments.length, assignments);
    console.log("4. Tabla tbSobrantesResultantes obtenida (Total filas):", subSobrantes.length, subSobrantes);

    // 1. Filtrar asignación con estatus 'TOMADO'
    const matchedAssignment = assignments.find(a => {
      const ordId = String(a.ORDER_ID || a.orderId || "").trim();
      const status = String(a.STATUS || a.status || "").trim().toUpperCase();
      return ordId.substring(0, 10) === prefix10 && status === "TOMADO";
    });

    console.log("5. Asignación 'TOMADA' coincidente:", matchedAssignment);

    if (!matchedAssignment) {
      console.warn("❌ No se encontró ninguna orden coincidente con estatus TOMADO.");
      container.innerHTML = `
        <div class="alert alert-danger" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 16px; border-radius: 6px;">
          ❌ No se encontró ninguna asignación activa con estatus <b>'TOMADO'</b> para el lote <b>${prefix10}</b>.
        </div>`;
      console.groupEnd();
      return;
    }

    const parentMatIdStr = String(matchedAssignment.MATERIAL_ID || matchedAssignment.materialId || "").trim();
    console.log("6. MATERIAL_ID Padre extraído:", parentMatIdStr);

    // 2. Órdenes hermanas
    const siblingOrders = assignments.filter(a => {
      const pId = String(a.MATERIAL_ID || a.materialId || "").trim();
      const st = String(a.STATUS || a.status || "").trim().toUpperCase();
      return pId === parentMatIdStr && st === "TOMADO";
    });

    console.log("7. Órdenes hermanas asociadas al sobrante padre:", siblingOrders);

    // 3. CONSULTA EN tbSobrantesResultantes
    const matchedSubRems = subSobrantes.filter(s => {
      const pKey = String(s.PARENT_MATERIAL_ID || s.parentMaterialId || s.MATERIAL_PADRE || s.parent_material_id || "").trim();
      const match = pKey === parentMatIdStr;
      console.log(`   --> Comparando fila BD pKey="${pKey}" contra parentMatIdStr="${parentMatIdStr}" => ¿Coincide?: ${match}`);
      return match;
    });

    console.log("8. Sub-remanentes filtrados en tbSobrantesResultantes:", matchedSubRems);

    // 4. Mapeo estructurado
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

    console.log("9. Objeto final de sub-remanentes procesados para renderizado:", subRemanentsWithState);

    currentLayoutData = {
      parentMatId: parentMatIdStr,
      mainOrder: matchedAssignment,
      siblingOrders: siblingOrders,
      subRemanents: subRemanentsWithState
    };

    console.groupEnd();
    renderLayoutGraphic();
  }

  function renderLayoutGraphic() {
    console.group("🎨 [DEBUG-CUTTER] Inicio Renderizado Gráfico");

    if (!currentLayoutData) {
      console.warn("⚠️ currentLayoutData es null. Abortando renderizado.");
      console.groupEnd();
      return;
    }

    const { parentMatId, mainOrder, siblingOrders, subRemanents } = currentLayoutData;
    const container = document.getElementById("cutter-layout-result");

    console.log("1. Datos entregados al Renderizador:", {
      parentMatId: parentMatId,
      totalOrders: siblingOrders.length,
      totalSubRemanents: subRemanents.length,
      subRemanentsList: subRemanents
    });

    const sumOrdersW = siblingOrders.reduce((sum, o) => sum + Number(o.WIDTH || o.width || 0), 0);
    const sumOrdersC = siblingOrders.reduce((sum, o) => sum + Number(o.CELLS || o.cells || 0), 0);
    const maxOrdersC = siblingOrders.reduce((max, o) => Math.max(max, Number(o.CELLS || o.cells || 0)), 0);

    const isVertical = sumOrdersC > maxOrdersC;
    const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];

    // Clasificación de sobrantes
    const subLateral = subRemanents.find(s => s.type === 'LATERAL') || (subRemanents.length > 0 ? subRemanents[0] : null);
    const subBottom = subRemanents.find(s => s.type === 'BOTTOM') || (subRemanents.length > 1 ? subRemanents[1] : null);

    console.log("2. Sobrante LATERAL asignado para DOM:", subLateral);
    console.log("3. Sobrante BOTTOM asignado para DOM:", subBottom);

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
        
        <!-- BLOQUE SUPERIOR -->
        <div style="display: flex; width: 100%; height: ${topBlockHeight}; gap: 6px; overflow: hidden;">
          
          <!-- COLUMNA DE ÓRDENES -->
          <div style="width: ${ordersColWidth}; height: 100%; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; gap: 3px;">`;

    siblingOrders.forEach((ord, idx) => {
      const w = Number(ord.WIDTH || ord.width);
      const c = Number(ord.CELLS || ord.cells);
      const pieceDimension = isVertical ? c : w;
      const totalDimension = isVertical ? sumOrdersC : sumOrdersW;
      const pct = (pieceDimension / totalDimension) * 100 || 0;
      const bg = colors[idx % colors.length];

      const pieceStyle = isVertical ? `width: 100%; height: ${pct}%;` : `width: ${pct}%; height: 100%;`;

      layoutGraphicHtml += `
        <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.8rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; border-radius: 3px;" title="${ord.ORDER_ID}">
          <span><b>${ord.ORDER_ID || ord.orderId}</b></span>
          <span style="font-size: 0.72rem; opacity: 0.9;">${w}W x ${c}C</span>
        </div>`;
    });

    layoutGraphicHtml += `</div>`;

    // 1. DIBUJAR SOBRANTE LATERAL (-SUB1)
    if (subLateral) {
      console.log("4. Dibujando en HTML Sobrante LATERAL:", subLateral.subMaterialId);
      const subId = subLateral.subMaterialId;
      const w = subLateral.width;
      const c = subLateral.cells;
      const isSaved = subLateral.statusConfirmation === 'SALVADO';
      const bgStyle = isSaved ? 'background: #1e293b; border: 2px dashed #38bdf8;' : 'background: #7f1d1d; border: 2px dashed #fca5a5;';
      const badgeText = isSaved ? '✅ SALVADO' : '❌ NO SALVADO';

      layoutGraphicHtml += `
        <div onclick="CutterView.openSubConfirmationModal('${subId}')" style="width: 35%; height: 100%; ${bgStyle} border-radius: 4px; color: #ffffff; font-size: 0.8rem; font-weight: bold; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 6px; cursor: pointer;" title="Haz clic para cambiar estatus">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.85rem;">✂️ ${subId}</span>
          <span style="font-size: 0.75rem; color: #cbd5e1; margin-top: 2px;">${w}W x ${c}C</span>
          <span style="font-size: 0.65rem; margin-top: 6px; background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 3px;">${badgeText}</span>
        </div>`;
    } else {
      console.log("4. NO se encontró Sobrante LATERAL para dibujar.");
    }

    layoutGraphicHtml += `</div>`; // FIN BLOQUE SUPERIOR

    // 2. DIBUJAR SOBRANTE INFERIOR (-SUB2)
    if (subBottom && subBottom !== subLateral) {
      console.log("5. Dibujando en HTML Sobrante INFERIOR:", subBottom.subMaterialId);
      const subId = subBottom.subMaterialId;
      const w = subBottom.width;
      const c = subBottom.cells;
      const isSaved = subBottom.statusConfirmation === 'SALVADO';
      const bgStyle = isSaved ? 'background: #1e293b; border: 2px dashed #38bdf8;' : 'background: #7f1d1d; border: 2px dashed #fca5a5;';
      const badgeText = isSaved ? '✅ SALVADO' : '❌ NO SALVADO';

      layoutGraphicHtml += `
        <div onclick="CutterView.openSubConfirmationModal('${subId}')" style="width: 100%; height: 30%; ${bgStyle} border-radius: 4px; color: #ffffff; font-size: 0.8rem; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 12px; cursor: pointer;" title="Haz clic para cambiar estatus">
          <span style="color: #38bdf8; font-family: monospace; font-size: 0.85rem;">✂️ ${subId}</span>
          <span style="font-size: 0.75rem; color: #cbd5e1;">(${w}W x ${c}C)</span>
          <span style="font-size: 0.65rem; background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 3px;">${badgeText}</span>
        </div>`;
    } else {
      console.log("5. NO se encontró Sobrante INFERIOR para dibujar.");
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

    console.groupEnd();
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
        String(s.subMaterialId) === String(subMaterialId)
      );

      if (sub) {
        sub.statusConfirmation = status;
        App.showToast(`Estatus de ${subMaterialId} actualizado a: ${status}`, "info");
        renderLayoutGraphic();
      }
    }
  }

  async function saveCutConfirmation() {
    if (!currentLayoutData) return;

    const { parentMatId, subRemanents, mainOrder } = currentLayoutData;
    
    const session = AuthService.getSession();
    const currentUserEmail = (session && session.user && session.user.email) ? session.user.email : "OPERADOR_CORTE";

    const updates = subRemanents.map(sub => ({
      subMaterialId: sub.subMaterialId,
      pcnId: sub.pcnId || mainOrder.PCN_ID,
      width: sub.width,
      cells: sub.cells,
      rack: sub.rack || mainOrder.RACK || '',
      loc: sub.loc || mainOrder.LOC || '',
      statusConfirmation: sub.statusConfirmation || 'SALVADO'
    }));

    App.showLoader("Guardando estatus de sobrantes y actualizando tablas...");

    try {
      const res = await GasAPI.send("confirmCutterSobrantes", {
        parentMaterialId: parentMatId,
        operatorEmail: currentUserEmail,
        updates: updates
      });

      if (res && res.success) {
        App.showToast("Corte procesado correctamente.", "success");

        // 1. Imprimir etiquetas Zebra de 4x1" solo para sobrantes SALVADOS
        const savedSubRems = updates.filter(s => s.statusConfirmation === 'SALVADO');
        if (savedSubRems.length > 0) {
          savedSubRems.forEach(sub => {
            printZebraLabel4x1(sub);
          });
        }

        // 2. REFRESCAR BASE DE DATOS LOCAL CON LOS NUEVOS REGISTROS DEL BACKEND
        await App.refreshDatabase();

        // 3. REINICIAR ESTADO Y LIMPIAR LA VISTA DE CORTE
        currentLayoutData = null;
        App.hideLoader();
        render(document.getElementById("cutter-view"));

      } else {
        App.hideLoader();
        App.showToast("Error guardando confirmación: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error en la comunicación con la base de datos: " + err.message, "error");
    }
  }

  // Obtener la IP ingresada por el usuario o usar una guardada en localStorage
  function getTargetPrinterIp() {
    return document.getElementById("input-printer-ip")?.value.trim() 
        || localStorage.getItem("cutter_printer_ip") 
        || "192.168.1.150";
  }
  
  async function printZebraLabel4x1(subId, parentId, pcn, w, c, rack, loc) {
    const targetIp = getTargetPrinterIp();
  
    // Guardar la IP para que el usuario no tenga que escribirla de nuevo
    localStorage.setItem("cutter_printer_ip", targetIp);
  
    App.showLoader(`Enviando impresión a la IP ${targetIp}...`);
  
    try {
      // Se envía la IP dinámica ingresada por el usuario al backend
      const res = await GasAPI.send("printZplDirectToIP", {
        printerIp: targetIp, // 👈 La IP escrita por el usuario
        subId: subId,
        parentId: parentId,
        pcn: pcn,
        width: w,
        cells: c,
        rack: rack,
        loc: loc
      });
  
      App.hideLoader();
  
      if (res && res.success) {
        App.showToast(`🖨️ Etiqueta enviada exitosamente a la impresora en ${targetIp}`, "success");
      } else {
        App.showToast("Error de impresión: " + (res?.message || "No se pudo conectar a la IP"), "error");
      }
    } catch (e) {
      App.hideLoader();
      App.showToast("Error de comunicación: " + e.message, "error");
    }
  }

  return {
    render: render,
    lookupLayout: lookupLayout,
    openSubConfirmationModal: openSubConfirmationModal,
    setSubStatus: setSubStatus,
    saveCutConfirmation: saveCutConfirmation,
    printZebraLabel4x1: printZebraLabel4x1
  };
})();
