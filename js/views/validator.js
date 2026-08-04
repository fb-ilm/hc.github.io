/**
 * Frontend - Vista para Rol Validador
 * Archivo: js/views/validator.js
 */

const ValidatorView = (function () {
  let pendingOrders = [];
  let currentProposal = null;
  let loadedFileSignature = null;
  let filterHighResidualOnly = false; // Estado del filtro > 20% residuo

  function render(container) {
    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2>Asignación de remanentes</h2>
          <p class="text-muted">Procesa órdenes y visualiza el acomodo en los remanentes.</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-outline-warning" onclick="ValidatorView.openStandbyModal()">
            Ordenes pendientes
          </button>
          <button type="button" class="btn btn-outline-primary" onclick="ValidatorView.openAssignmentsModal()">
            Ordenes asignadas
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 400px 1fr; gap: 10px;">
        <!-- PANEL DE ENTRADA -->
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3>Ingreso de datos</h3>
            <button class="btn btn-sm btn-outline-danger" onclick="ValidatorView.resetQueue()" title="Limpiar todo">Reset</button>
          </div>
          <hr style="margin: 12px 0;">

          <!-- MODO MANUAL -->
          <form id="form-single-order" onsubmit="return false;" style="margin-bottom: 20px;">
            <h4 style="font-size: 0.85rem; margin-bottom: 8px;">Ingreso manual</h4>
            <div class="form-group">
              <label>Shopfloor ID</label>
              <input type="text" id="val-order-id" class="form-control" placeholder="00XXXXXXXX0000XX000X" required>
            </div>
            <div class="form-group">
              <label>PCN Material</label>
              <input type="text" id="val-pcn" class="form-control" placeholder="1019594" required>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label>WIDTH / Ancho</label>
                <input type="number" id="val-width" class="form-control" placeholder="30" required>
              </div>
              <div class="form-group">
                <label>CELLS / Celdas</label>
                <input type="number" id="val-cells" class="form-control" placeholder="25" required>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-block" onclick="ValidatorView.addSingleOrder()">
              Agregar
            </button>
          </form>

          <!-- MODO MASIVO CSV -->
          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
            <h4 style="font-size: 0.85rem; margin-bottom: 8px;">Carga de datos</h4>
            <p style="font-size: 0.72rem; color: #64748b; margin-bottom: 8px;">
              Columnas: ORDER_DATE | PCN_ID | ORDER_ID | WIDTH | CELLS
            </p>
            <input type="file" id="file-orders-csv" accept=".csv" class="form-control" style="margin-bottom: 8px;">
            <button type="button" id="btn-load-csv" class="btn btn-outline-primary btn-block" onclick="ValidatorView.loadOrdersCSV()">
              Cargar
            </button>
          </div>
        </div>

        <!-- PANEL DE CARRITO Y VISUALIZACIÓN GRÁFICA -->
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <h3>Lista de asignación</h3>
              <!-- FILTRO DE RESIDUO MAYOR A 20% -->
              <label style="font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 6px; background: #f1f5f9; padding: 4px 10px; border-radius: 4px; border: 1px solid #cbd5e1;">
                <input type="checkbox" id="chk-filter-residual" onchange="ValidatorView.toggleResidualFilter(this.checked)">
                <span>Ver solo desperdicio &gt; 20%</span>
              </label>
            </div>
            <button type="button" class="btn btn-success" id="btn-confirm-commit" onclick="ValidatorView.commitAssignments()" disabled>
              Confirmar
            </button>
          </div>
          <hr style="margin-bottom: 16px;">

          <div id="proposal-output">
            <p style="color: #64748b; font-style: italic;">Ingresa o carga órdenes para calcular la asignación.</p>
          </div>
        </div>
      </div>
    `;
  }

  function toggleResidualFilter(checked) {
    filterHighResidualOnly = checked;
    renderProposalVisual();
  }

  function addSingleOrder() {
    const orderId = document.getElementById("val-order-id").value.trim();
    const pcn = document.getElementById("val-pcn").value.trim();
    const width = Number(document.getElementById("val-width").value);
    const cells = Number(document.getElementById("val-cells").value);

    if (!orderId || !pcn || !width || !cells) {
      App.showToast("Ingresa ORDER_ID, PCN_ID, WIDTH y CELLS.", "error");
      return;
    }

    if (pendingOrders.some((o) => String(o.ORDER_ID) === String(orderId))) {
      App.showToast(`La orden ${orderId} ya está agregada en la lista.`, "error");
      return;
    }

    const nowFormatted = new Date().toLocaleString("en-US", { timeZone: "UTC" });
    pendingOrders.push({
      ORDER_ID: orderId,
      ORDER_DATE: nowFormatted,
      PCN_ID: pcn,
      WIDTH: width,
      CELLS: cells,
    });

    document.getElementById("val-order-id").value = "";
    document.getElementById("val-width").value = "";
    document.getElementById("val-cells").value = "";
    document.getElementById("val-order-id").focus();

    App.showToast(`Orden ${orderId} agregada.`, "info");
    processProposal();
  }

  async function loadOrdersCSV() {
    const fileInput = document.getElementById("file-orders-csv");
    if (!fileInput.files.length) return App.showToast("Selecciona un archivo CSV.", "error");

    const file = fileInput.files[0];
    const fileSig = `${file.name}_${file.size}_${file.lastModified}`;

    if (loadedFileSignature === fileSig) {
      App.showToast("Este archivo ya fue cargado previamente.", "error");
      return;
    }

    if (pendingOrders.length > 0 && loadedFileSignature) {
      App.showToast("Ya existe un archivo cargado en proceso. Confirma o limpia la propuesta actual.", "error");
      return;
    }

    try {
      const required = ["ORDER_DATE", "PCN_ID", "ORDER_ID", "WIDTH", "CELLS"];
      const parsed = await CSVParser.parseFile(file, required);

      loadedFileSignature = fileSig;
      pendingOrders = pendingOrders.concat(parsed.data);

      document.getElementById("file-orders-csv").disabled = true;
      document.getElementById("btn-load-csv").disabled = true;

      App.showToast(`${parsed.data.length} órdenes cargadas exitosamente.`, "success");
      processProposal();
    } catch (err) {
      App.showToast(err.message, "error");
    }
  }

  function resetQueue() {
    pendingOrders = [];
    currentProposal = null;
    loadedFileSignature = null;

    const fileInput = document.getElementById("file-orders-csv");
    const loadBtn = document.getElementById("btn-load-csv");
    if (fileInput) {
      fileInput.disabled = false;
      fileInput.value = "";
    }
    if (loadBtn) {
      loadBtn.disabled = false;
    }

    renderProposalVisual();
    App.showToast("Lista y controles reiniciados.", "info");
  }

  function processProposal() {
    const rawInv = App.getDbTable("tbInventario");
    currentProposal = NestingEngine.calculateAssignments(rawInv, pendingOrders);
    renderProposalVisual();
  }

  function renderProposalVisual() {
    const output = document.getElementById("proposal-output");
    const confirmBtn = document.getElementById("btn-confirm-commit");

    if (
      !currentProposal ||
      (currentProposal.assignments.length === 0 && currentProposal.unassignedOrders.length === 0)
    ) {
      output.innerHTML = `<p style="color: #64748b;">No hay propuesta de asignación disponible.</p>`;
      confirmBtn.disabled = true;
      return;
    }

    confirmBtn.disabled = currentProposal.assignments.length === 0;

    let assignmentsToRender = currentProposal.assignments;

    if (filterHighResidualOnly) {
      assignmentsToRender = assignmentsToRender.filter(a => (a.residualPercentage || 0) > 20);
    }

    let html = `<div style="max-height: 540px; overflow-y: auto;">`;

    // 1. SOBRANTES ASIGNADOS
    if (assignmentsToRender.length > 0) {
      const totalCount = currentProposal.assignments.length;
      const filteredCount = assignmentsToRender.length;
      const countLabel = filterHighResidualOnly ? `${filteredCount} de ${totalCount}` : `${totalCount}`;

      html += `<h4 style="color: #16a34a; margin-bottom: 12px;">Sobrantes Asignados (${countLabel})</h4>`;

      assignmentsToRender.forEach((item) => {
        const assignIdx = currentProposal.assignments.indexOf(item);
        const matIdClean = item.materialId || item["MATERIAL_ID"] || item.MATERIAL_ID || "N/A";
        const origWidth = item.originalWidth || item.WIDTH || "N/A";
        const origCells = item.originalCells || item.CELLS || "N/A";
        const rack = item.rack || item.RACK || "N/A";
        const loc = item.loc || item.LOC || "N/A";
        const status = item.status || item.STATUS || "N/A";
        const orientation = item.orientation || "WIDTH";
        const resPct = item.residualPercentage !== undefined ? item.residualPercentage : 0;

        const badgeColor =
          status === "AUDITADO"
            ? "background: #dcfce7; color: #15803d;"
            : "background: #fef3c7; color: #b45309;";

        const resBadgeStyle = resPct > 20 
          ? "background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;" 
          : "background: #f1f5f9; color: #475569;";

        const isVertical = orientation === 'CELLS';
        const containerHeight = isVertical ? `${Math.max(80, item.orders.length * 45)}px` : '60px';
        const flexDirection = isVertical ? 'column' : 'row';

        html += `
          <div style="border: 2px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 16px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: #f8fafc; padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0;">
              <div>
                <span style="font-size: 0.75rem; font-weight: bold; color: #64748b; text-transform: uppercase;">SOBRANTE:</span>
                <span style="font-size: 1.15rem; font-weight: 800; font-family: monospace; color: #2563eb; margin-left: 4px;">${matIdClean}</span>
                <span class="badge" style="${badgeColor} margin-left: 8px;">${status}</span>
                <span class="badge" style="${resBadgeStyle} margin-left: 4px;">Residuo: ${resPct}%</span>
                <div style="font-size: 0.78rem; color: #475569; margin-top: 2px;">
                  <b>PCN:</b> ${item.pcnId} | <b>Medidas:</b> ${origWidth}W x ${origCells}C | <b>Acomodo:</b> <span style="color: ${isVertical ? '#0284c7' : '#059669'}; font-weight: bold;">${isVertical ? 'VERTICAL (CELLS)' : 'HORIZONTAL (WIDTH)'}</span> | <b>Ubicación:</b> ${rack}-${loc}
                </div>
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="ValidatorView.openSearchModalForGroup(${assignIdx})">
                  Cambiar remanente
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="ValidatorView.removeAssignmentGroup(${assignIdx})" title="Eliminar asignación completa">
                  Eliminar
                </button>
              </div>
            </div>

            <!-- CONTENEDOR DINÁMICO DE CORTE (HORIZONTAL U HORIZONTAL/VERTICAL) -->
            <div style="position: relative; width: 100%; height: ${containerHeight}; background: #e2e8f0; border: 2px solid #94a3b8; border-radius: 4px; display: flex; flex-direction: ${flexDirection}; overflow: hidden; padding: 2px; gap: 2px;">`;

        let accumulatedPercent = 0;
        const totalDimension = isVertical ? Number(origCells) : Number(origWidth);
        const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];

        item.orders.forEach((ord, idx) => {
          const pieceDimension = isVertical ? Number(ord.cells) : Number(ord.width);
          const pct = Math.min(
            (pieceDimension / totalDimension) * 100 || 0,
            100 - accumulatedPercent
          );
          accumulatedPercent += pct;
          const bg = colors[idx % colors.length];

          const pieceStyle = isVertical 
            ? `width: 100%; height: ${pct}%; border-bottom: 1px solid #fff;` 
            : `width: ${pct}%; height: 100%; border-right: 1px solid #fff;`;

          html += `
            <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.75rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; overflow: hidden; padding: 4px 10px;" title="Orden: ${ord.orderId} (${ord.width}W x ${ord.cells}C)">
              <span><b>${ord.orderId}</b></span>
              <span style="font-size: 0.7rem; opacity: 0.9;">${ord.width}W x ${ord.cells}C</span>
            </div>`;
        });

        // Espacio libre residual
        const remainingPct = Math.max(0, 100 - accumulatedPercent);
        if (remainingPct > 0) {
          const freeStyle = isVertical ? `width: 100%; height: ${remainingPct}%;` : `width: ${remainingPct}%; height: 100%;`;
          html += `
            <div style="${freeStyle} background: #cbd5e1; color: #475569; font-size: 0.7rem; font-weight: bold; display: flex; justify-content: center; align-items: center;">
              Libre (${remainingPct.toFixed(0)}%)
            </div>`;
        }

        html += `</div></div>`;
      });
    } else if (filterHighResidualOnly && currentProposal.assignments.length > 0) {
      html += `<p style="color: #64748b; font-style: italic; padding: 10px;">No hay sobrantes asignados con residuo mayor al 20%.</p>`;
    }

    // 2. ÓRDENES SIN SOBRANTE AUTOMÁTICO
    if (currentProposal.unassignedOrders.length > 0 && !filterHighResidualOnly) {
      html += `<h4 style="color: #dc2626; margin-top: 20px; margin-bottom: 8px;">Ordenes sin asignación encontrada (${currentProposal.unassignedOrders.length})</h4>`;

      html += `<table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 12px;">
        <thead>
          <tr style="background: #fef2f2; color: #991b1b; text-align: left;">
            <th style="padding: 6px;">ORDER_ID</th>
            <th style="padding: 6px;">PCN</th>
            <th style="padding: 6px;">MEDIDAS</th>
            <th style="padding: 6px;">ACCIONES MANUALES</th>
          </tr>
        </thead>
        <tbody>`;

      currentProposal.unassignedOrders.forEach((u, index) => {
        html += `
          <tr style="border-bottom: 1px solid #fee2e2;">
            <td style="padding: 6px; font-weight: bold; font-family: monospace;">${u.orderId}</td>
            <td style="padding: 6px;">${u.pcnId}</td>
            <td style="padding: 6px;">${u.width} W x ${u.cells} C</td>
            <td style="padding: 6px; display: flex; gap: 6px;">
              <button class="btn btn-sm btn-primary" onclick="ValidatorView.openSearchModalForOrder(${index})">Buscar en sistema</button>
              <button class="btn btn-sm btn-outline-danger" onclick="ValidatorView.removeUnassignedOrder(${index})">Eliminar</button>
            </td>
          </tr>`;
      });

      html += `</tbody></table>`;
    }

    html += `</div>`;
    output.innerHTML = html;
  }

  function removeAssignmentGroup(assignIdx) {
    if (!currentProposal || !currentProposal.assignments[assignIdx]) return;

    const removedGroup = currentProposal.assignments.splice(assignIdx, 1)[0];
    if (removedGroup && removedGroup.orders) {
      removedGroup.orders.forEach((ord) => {
        currentProposal.unassignedOrders.push(ord);
      });
    }

    App.showToast("Asignación removida. Sus órdenes se movieron a la lista no asignada.", "info");
    renderProposalVisual();
  }

  function openSearchModalForGroup(assignIdx) {
    const group = currentProposal.assignments[assignIdx];
    const reqWidth = group.orders.reduce((sum, o) => sum + Number(o.width), 0);
    const reqCells = Math.max(...group.orders.map((o) => Number(o.cells)));

    renderSearchModal({
      title: "Buscar Nuevo Sobrante para Grupo",
      pcnId: group.pcnId,
      width: reqWidth,
      cells: reqCells,
      onSelect: (selectedMat) => {
        const selectedMatId = selectedMat["MATERIAL_ID"] || selectedMat.MATERIAL_ID || selectedMat.materialId;
        group.materialId = selectedMatId;
        group.originalWidth = Number(selectedMat.WIDTH);
        group.originalCells = Number(selectedMat.CELLS);
        group.rack = selectedMat.RACK;
        group.loc = selectedMat.LOC;
        group.status = selectedMat.STATUS;

        App.showToast(`Sobrante cambiado a MATERIAL ID: ${selectedMatId}`, "success");
        closeModal();
        renderProposalVisual();
      },
    });
  }

  function openSearchModalForOrder(unassignedIndex) {
    const order = currentProposal.unassignedOrders[unassignedIndex];

    renderSearchModal({
      title: `Buscar Sobrante para Orden ${order.orderId}`,
      pcnId: order.pcnId,
      width: order.width,
      cells: order.cells,
      onSelect: (selectedMat) => {
        const selectedMatId = selectedMat["MATERIAL_ID"] || selectedMat.MATERIAL_ID || selectedMat.materialId;

        currentProposal.unassignedOrders.splice(unassignedIndex, 1);

        let existingAssign = currentProposal.assignments.find(
          (a) => String(a.materialId || a.MATERIAL_ID) === String(selectedMatId)
        );

        if (existingAssign) {
          existingAssign.orders.push({
            orderId: order.orderId,
            orderDate: order.orderDate,
            pcnId: order.pcnId,
            width: Number(order.width),
            cells: Number(order.cells),
          });
        } else {
          currentProposal.assignments.push({
            materialId: selectedMatId,
            pcnId: selectedMat.PCN_ID,
            rack: selectedMat.RACK,
            loc: selectedMat.LOC,
            originalWidth: Number(selectedMat.WIDTH),
            originalCells: Number(selectedMat.CELLS),
            status: selectedMat.STATUS,
            orientation: 'WIDTH',
            orders: [
              {
                orderId: order.orderId,
                orderDate: order.orderDate,
                pcnId: order.pcnId,
                width: Number(order.width),
                cells: Number(order.cells),
              },
            ],
          });
        }

        App.showToast(`Orden ${order.orderId} asignada al MATERIAL ID: ${selectedMatId}`, "success");
        closeModal();
        renderProposalVisual();
      },
    });
  }

  function renderSearchModal(config) {
    const modalBody = `
      <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
        <h4 style="font-size: 0.85rem; margin-bottom: 8px;">Filtros de Búsqueda en tbInventario</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 0.75rem; font-weight: bold;">PCN_ID</label>
            <input type="text" id="modal-filter-pcn" class="form-control" value="${config.pcnId}">
          </div>
          <div>
            <label style="font-size: 0.75rem; font-weight: bold;">WIDTH Min</label>
            <input type="number" id="modal-filter-width" class="form-control" value="${config.width}">
          </div>
          <div>
            <label style="font-size: 0.75rem; font-weight: bold;">CELLS Min</label>
            <input type="number" id="modal-filter-cells" class="form-control" value="${config.cells}">
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-primary btn-block" style="margin-top: 10px;" onclick="ValidatorView.executeModalSearch()">
          🔍 Aplicar Filtros
        </button>
      </div>

      <div id="modal-search-results" style="max-height: 260px; overflow-y: auto;">Cargando resultados...</div>
    `;

    document.getElementById("modal-title").innerText = config.title;
    document.getElementById("modal-body-content").innerHTML = modalBody;
    document.getElementById("modal-footer-actions").innerHTML = `
      <button class="btn btn-outline-danger" onclick="closeModal()">Cancelar</button>
    `;

    ValidatorView.activeOnSelectCallback = config.onSelect;

    document.getElementById("app-modal").classList.remove("hidden");
    executeModalSearch();
  }

  function executeModalSearch() {
    const pcn = document.getElementById("modal-filter-pcn").value.trim();
    const width = Number(document.getElementById("modal-filter-width").value) || 0;
    const cells = Number(document.getElementById("modal-filter-cells").value) || 0;
    const container = document.getElementById("modal-search-results");

    const rawInv = App.getDbTable("tbInventario");

    const assignedMaterialIds = (currentProposal.assignments || []).map((a) =>
      String(a.materialId || a.MATERIAL_ID || "").trim()
    );

    const matches = rawInv.filter((m) => {
      const matIdStr = String(m["MATERIAL_ID"] || m.MATERIAL_ID || "").trim();
      const isAlreadyAssigned = assignedMaterialIds.includes(matIdStr);

      return (
        !isAlreadyAssigned &&
        m.STATUS !== "ELIMINADO" &&
        String(m.PCN_ID).trim() === pcn &&
        Number(m.WIDTH) >= width + CONFIG.MARGINS.WIDTH &&
        Number(m.CELLS) >= cells + CONFIG.MARGINS.CELLS
      );
    });

    if (matches.length === 0) {
      container.innerHTML = `<p style="color: #dc2626; text-align: center; font-size: 0.85rem; padding: 12px;">No se encontraron sobrantes disponibles en tbInventario.</p>`;
      return;
    }

    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
      <thead>
        <tr style="background: #f1f5f9; text-align: left;">
          <th style="padding: 6px;">MATERIAL ID</th>
          <th style="padding: 6px;">ESTATUS</th>
          <th style="padding: 6px;">MEDIDAS</th>
          <th style="padding: 6px;">UBICACIÓN</th>
          <th style="padding: 6px;">ACCIÓN</th>
        </tr>
      </thead>
      <tbody>`;

    matches.forEach((m, idx) => {
      const matId = m["MATERIAL_ID"] || m.MATERIAL_ID || m.materialId || "N/A";
      const badgeStyle =
        m.STATUS === "AUDITADO"
          ? "background: #dcfce7; color: #15803d;"
          : "background: #fef3c7; color: #b45309;";
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px; font-weight: bold; font-family: monospace; color: #2563eb;">${matId}</td>
          <td style="padding: 6px;"><span class="badge" style="${badgeStyle}">${m.STATUS}</span></td>
          <td style="padding: 6px;">${m.WIDTH} W x ${m.CELLS} C</td>
          <td style="padding: 6px;">${m.RACK || "N/A"}-${m.LOC || "N/A"}</td>
          <td style="padding: 6px;">
            <button class="btn btn-sm btn-success" onclick="ValidatorView.selectMatchItem(${idx})">Seleccionar</button>
          </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;

    ValidatorView.currentModalMatches = matches;
  }

  function selectMatchItem(index) {
    const selected = ValidatorView.currentModalMatches[index];
    if (selected && typeof ValidatorView.activeOnSelectCallback === "function") {
      ValidatorView.activeOnSelectCallback(selected);
    }
  }

  function removeUnassignedOrder(index) {
    if (currentProposal && currentProposal.unassignedOrders) {
      const removed = currentProposal.unassignedOrders.splice(index, 1);
      App.showToast(`Orden ${removed[0].orderId} descartada.`, "info");
      renderProposalVisual();
    }
  }

  async function commitAssignments() {
    if (!currentProposal || currentProposal.assignments.length === 0) return;

    const allAssignedOrders = [];
    currentProposal.assignments.forEach((assignment) => {
      assignment.orders.forEach((ord) => allAssignedOrders.push(ord));
    });

    const pendingPrefixMap = {};
    pendingOrders.forEach((ord) => {
      const rawId = String(ord.ORDER_ID || ord.orderId || "").trim();
      const prefix10 = rawId.substring(0, 10);
      if (prefix10) {
        if (!pendingPrefixMap[prefix10]) pendingPrefixMap[prefix10] = [];
        pendingPrefixMap[prefix10].push(ord);
      }
    });

    const completePrefixes = [];
    const incompletePrefixes = [];

    Object.keys(pendingPrefixMap).forEach((prefix10) => {
      const totalInBatch = pendingPrefixMap[prefix10];
      const assignedInBatch = allAssignedOrders.filter((ord) =>
        String(ord.orderId || ord.ORDER_ID).startsWith(prefix10)
      );

      if (assignedInBatch.length === totalInBatch.length) {
        completePrefixes.push(prefix10);
      } else {
        incompletePrefixes.push({
          prefix10: prefix10,
          total: totalInBatch.length,
          assigned: assignedInBatch.length,
        });
      }
    });

    openBatchValidationModal(completePrefixes, incompletePrefixes);
  }

  function openBatchValidationModal(completePrefixes, incompletePrefixes) {
    let completeListHtml = "";
    if (completePrefixes.length === 0) {
      completeListHtml = `<li style="color: #64748b;">No hay lotes 100% completos en este bloque.</li>`;
    } else {
      completePrefixes.forEach((p) => {
        completeListHtml += `<li><b>Lote ${p}</b>: 100% de las órdenes asignadas.</li>`;
      });
    }

    let incompleteListHtml = "";
    if (incompletePrefixes.length === 0) {
      incompleteListHtml = `<li style="color: #64748b;">No hay lotes incompletos.</li>`;
    } else {
      incompletePrefixes.forEach((inc) => {
        incompleteListHtml += `<li><b>Lote ${inc.prefix10}</b>: ${inc.assigned} de ${inc.total} órdenes asignadas.</li>`;
      });
    }

    const modalHtml = `
      <div id="modal-batch-confirm" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 650px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          
          <!-- CABECERA (FIJA) -->
          <div style="flex-shrink: 0;">
            <h3 style="margin-top: 0; color: #1e293b;">Resumen de Asignación por ordenes</h3>
            <p style="font-size: 0.85rem; color: #475569; margin-bottom: 12px;">
              A continuación se presenta el balance de las ordenes. Todas las órdenes con sobrante asignado serán procesadas en la base de datos.
            </p>
          </div>

          <!-- CUERPO SCROLLABLE PARA MUCHAS ÓRDENES -->
          <div style="flex: 1; overflow-y: auto; padding-right: 6px; margin-bottom: 16px;">
            ${incompletePrefixes.length > 0 ? `
              <div style="background: #fefce8; border: 1px solid #fef08a; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.8rem;">
                <strong style="color: #854d0e;">⚠️ Ordenes Incompletas:</strong>
                <ul style="margin: 6px 0 0 18px; padding: 0; color: #991b1b; max-height: 150px; overflow-y: auto;">${incompleteListHtml}</ul>
              </div>
            ` : ''}

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 6px; font-size: 0.8rem;">
              <strong style="color: #166534;">✅ Ordenes Completas:</strong>
              <ul style="margin: 6px 0 0 18px; padding: 0; color: #15803d; max-height: 200px; overflow-y: auto;">${completeListHtml}</ul>
            </div>
          </div>

          <!-- PIE DE PÁGINA / BOTONES (FIJO) -->
          <div style="flex-shrink: 0; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-batch-confirm').remove()">
              Cancelar / Revisar
            </button>
            <button type="button" class="btn btn-success" id="btn-proceed-commit-all">
              Confirmar y Guardar Todo
            </button>
          </div>

        </div>
      </div>
    `;

    const existing = document.getElementById("modal-batch-confirm");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const proceedBtn = document.getElementById("btn-proceed-commit-all");
    if (proceedBtn) {
      proceedBtn.onclick = async () => {
        document.getElementById("modal-batch-confirm").remove();
        await executeCommitProcess(currentProposal.assignments);
      };
    }
  }

  async function executeCommitProcess(assignmentsToSave) {
    if (!assignmentsToSave || assignmentsToSave.length === 0) {
      App.showToast("No hay asignaciones válidas para guardar.", "warning");
      return;
    }

    App.showLoader("Guardando asignaciones de ordenes...");

    try {
      const res = await GasAPI.send("commitAssignments", { assignments: assignmentsToSave });
      App.hideLoader();

      if (res && res.success) {
        App.showToast("¡Asignaciones confirmadas e inventario actualizado con éxito!", "success");
        resetQueue();
        await App.refreshDatabase();
      } else {
        const errorMsg = res && res.message ? res.message : "Error desconocido al procesar el lote.";
        App.showToast("Error guardando asignaciones: " + errorMsg, "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error en la comunicación con la base de datos: " + err.message, "error");
    }
  }

  function openStandbyModal() {
    const standbyList = App.getDbTable("tbStandby") || [];
    const activeStandby = standbyList.filter((s) => s.STATUS !== "RESOLVED" && s.STATUS !== "ELIMINADO");

    let tableContent = "";
    if (activeStandby.length === 0) {
      tableContent = `<p style="color: #64748b; text-align: center; padding: 20px;">No hay registros pendientes en Standby.</p>`;
    } else {
      tableContent = `
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left; position: sticky; top: 0; z-index: 1;">
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ORDER_ID</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">PCN_ID</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MEDIDAS</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MOTIVO</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">FECHA STANDBY</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ESTATUS</th>
              </tr>
            </thead>
            <tbody>`;

      activeStandby.forEach((row) => {
        const orderId = String(row.ORDER_ID || row.orderId || "N/A");
        const pcnId = row.PCN_ID || row.pcnId || "N/A";
        const width = row.WIDTH || row.width || "0";
        const cells = row.CELLS || row.cells || "0";
        const reason = row.REASON || row.reason || "STANDBY";
        const fecha = row.FECHA_STANDBY || row.FECHA || "N/A";
        const status = row.STATUS || row.status || "STANDBY";

        tableContent += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #2563eb;">${orderId}</td>
            <td style="padding: 8px;">${pcnId}</td>
            <td style="padding: 8px;">${width}W x ${cells}C</td>
            <td style="padding: 8px;"><span class="badge" style="background: #fef3c7; color: #b45309;">${reason}</span></td>
            <td style="padding: 8px;">${fecha}</td>
            <td style="padding: 8px;"><span class="badge" style="background: #e0f2fe; color: #0369a1;">${status}</span></td>
          </tr>`;
      });

      tableContent += `</tbody></table></div>`;
    }

    const modalHtml = `
      <div id="modal-standby-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 900px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">Órdenes pendientes</h3>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-success" style="font-size: 0.8rem;" onclick="ValidatorView.exportStandbyToCSV()">
                Exportar
              </button>
              <button type="button" onclick="document.getElementById('modal-standby-popup').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
          </div>
          ${tableContent}
          <div style="text-align: right; margin-top: 15px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-standby-popup').remove()">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-standby-popup");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  function exportStandbyToCSV() {
    const standbyList = App.getDbTable("tbStandby") || [];
    const activeStandby = standbyList.filter((s) => s.STATUS !== "RESOLVED" && s.STATUS !== "ELIMINADO");

    if (activeStandby.length === 0) {
      App.showToast("No hay datos para exportar.", "warning");
      return;
    }

    const headers = ["ORDER_ID", "PCN_ID", "WIDTH", "CELLS", "REASON", "FECHA_STANDBY", "STATUS"];
    let csvContent = "\uFEFF" + headers.join(",") + "\r\n";

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
    link.setAttribute("download", `Reporte_Standby_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    App.showToast("Archivo exportado con éxito.", "success");
  }

  function openAssignmentsModal() {
    const assignments = App.getDbTable("tbAsignaciones") || [];

    let tableContent = "";
    if (assignments.length === 0) {
      tableContent = `<p style="color: #64748b; text-align: center; padding: 20px;">No hay registros guardados.</p>`;
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
        const matId = row["MATERIAL_ID"] || row.MATERIAL_ID || row.materialId || "N/A";
        const fecha = row.RECORD_DATE || row.FECHA || "N/A";
        const orderId = String(row.ORDER_ID || row.orderId || "N/A");
        const pcnId = row.PCN_ID || row.pcnId || "N/A";
        const rack = row.RACK || row.rack || "N/A";
        const loc = row.LOC || row.loc || "N/A";
        const width = row.WIDTH || row.width || "0";
        const cells = row.CELLS || row.cells || "0";
        const status = row.STATUS;

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

      tableContent += `</tbody></table></div>`;
    }

    const modalHtml = `
      <div id="modal-assignments-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 900px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">Historial de asignaciones</h3>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-success" style="font-size: 0.8rem;" onclick="ValidatorView.exportAssignmentsToCSV()">
                Exportar
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

  function exportAssignmentsToCSV() {
    const assignments = App.getDbTable("tbAsignaciones") || [];

    if (assignments.length === 0) {
      App.showToast("No hay datos disponibles para exportar.", "warning");
      return;
    }

    const headers = ["MATERIAL_ID", "FECHA_ASIGNACION", "ORDER_DATE", "ORDER_ID", "PCN_ID", "RACK", "LOC", "WIDTH", "CELLS", "STATUS"];
    let csvContent = "\uFEFF" + headers.join(",") + "\r\n";

    assignments.forEach((row) => {
      const matId = row["MATERIAL_ID"] || row.MATERIAL_ID || row.materialId || "";
      const fechaAsig = row.RECORD_DATE || row.FECHA || "";
      const fechaOrd = row.ORDER_DATE || fechaAsig;
      const orderId = String(row.ORDER_ID || row.orderId || "");
      const pcnId = String(row.PCN_ID || row.pcnId || "");
      const rack = row.RACK || row.rack || "";
      const loc = row.LOC || row.loc || "";
      const width = row.WIDTH || row.width || "0";
      const cells = row.CELLS || row.cells || "0";
      const status = row.STATUS || row.status || "ASIGNADO";

      const formattedOrderId = orderId ? `="${orderId}"` : '""';
      const formattedPcnId = pcnId ? `="${pcnId}"` : '""';
      const formattedMatId = matId ? `="${matId}"` : '""';

      const line = [
        formattedMatId,
        `"${fechaAsig}"`,
        `"${fechaOrd}"`,
        formattedOrderId,
        formattedPcnId,
        `"${rack}"`,
        `"${loc}"`,
        width,
        cells,
        `"${status}"`,
      ].join(",");

      csvContent += line + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Asignaciones_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    App.showToast("Archivo CSV exportado con éxito.", "success");
  }

  return {
    render: render,
    toggleResidualFilter: toggleResidualFilter,
    addSingleOrder: addSingleOrder,
    loadOrdersCSV: loadOrdersCSV,
    resetQueue: resetQueue,
    openSearchModalForGroup: openSearchModalForGroup,
    openSearchModalForOrder: openSearchModalForOrder,
    executeModalSearch: executeModalSearch,
    selectMatchItem: selectMatchItem,
    removeUnassignedOrder: removeUnassignedOrder,
    removeAssignmentGroup: removeAssignmentGroup,
    commitAssignments: commitAssignments,
    openStandbyModal: openStandbyModal,
    exportStandbyToCSV: exportStandbyToCSV,
    openAssignmentsModal: openAssignmentsModal,
    exportAssignmentsToCSV: exportAssignmentsToCSV,
  };
})();

function closeModal() {
  const modal = document.getElementById("app-modal");
  if (modal) modal.classList.add("hidden");
}
