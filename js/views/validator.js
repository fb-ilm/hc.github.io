/**
 * Frontend - Vista para Rol Validador
 * Archivo: js/views/validator.js
 */

const ValidatorView = (function () {
  let pendingOrders = [];
  let currentProposal = null;
  let loadedFileSignature = null;
  let filterHighResidualOnly = false;
  let filterAssignedOrderId = "";
  let filterUnassignedOrderId = "";

  function render(container) {
    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2>Asignación de remanentes</h2>
          <p class="text-muted">Procesamiento de ordenes, visualización y gestión de acomodo de remanentes.</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-outline-success" onclick="ValidatorView.openActivationModal()">
            Activación de asignaciones
          </button>
          <button type="button" class="btn btn-outline-warning" onclick="ValidatorView.openStandbyModal()">
            Órdenes pendientes
          </button>
          <button type="button" class="btn btn-outline-primary" onclick="ValidatorView.openAssignmentsModal()">
            Órdenes asignadas
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

  function filterAssignedOrders(query) {
    filterAssignedOrderId = String(query || "").trim().toLowerCase();
    renderProposalVisual();
  }

  function filterUnassignedOrders(query) {
    filterUnassignedOrderId = String(query || "").trim().toLowerCase();
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

    if (pendingOrders.some((o) => String(o.ORDER_ID || o.orderId) === String(orderId))) {
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
    processProposalAsync();
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

    try {
      App.showLoader("Leyendo archivo CSV...");
      const required = ["ORDER_DATE", "PCN_ID", "ORDER_ID", "WIDTH", "CELLS"];
      const parsed = await CSVParser.parseFile(file, required);

      loadedFileSignature = fileSig;
      pendingOrders = pendingOrders.concat(parsed.data);

      document.getElementById("file-orders-csv").disabled = true;
      document.getElementById("btn-load-csv").disabled = true;

      App.showLoader(`Calculando propuesta óptima para ${pendingOrders.length} órdenes...`);

      setTimeout(() => {
        processProposal();
        App.hideLoader();
        App.showToast("Asignación calculada exitosamente.", "success");
      }, 60);

    } catch (err) {
      App.hideLoader();
      App.showToast(err.message, "error");
    }
  }

  function processProposal() {
    const rawInv = App.getDbTable("tbInventario");
    currentProposal = NestingEngine.calculateAssignments(rawInv, pendingOrders);
    renderProposalVisual();
  }

  function processProposalAsync() {
    if (!pendingOrders || pendingOrders.length === 0) {
      App.hideLoader();
      return;
    }

    App.showLoader(`Iniciando optimización para ${pendingOrders.length} órdenes...`);

    const rawInv = App.getDbTable("tbInventario");
    
    calculateAssignmentsInChunks(rawInv, pendingOrders, (progressPct) => {
      App.showLoader(`Calculando acomodo óptimo: ${progressPct}% completado...`);
    }).then((proposal) => {
      currentProposal = proposal;
      
      App.showLoader("Generando vista previa de asignaciones...");
      
      setTimeout(() => {
        renderProposalVisual();
        App.hideLoader();
        App.showToast("Propuesta de asignación procesada con éxito.", "success");
      }, 50);

    }).catch((err) => {
      console.error("Error al procesar asignaciones:", err);
      App.hideLoader();
      App.showToast("Error procesando optimización: " + err.message, "error");
    });
  }

  function calculateAssignmentsInChunks(inventory, orders, progressCallback) {
    return new Promise((resolve, reject) => {
      try {
        let availableMaterials = inventory
          .filter(m => m.STATUS !== 'ELIMINADO')
          .map(m => {
            const w = Number(m.WIDTH) || 0;
            const c = Number(m.CELLS) || 0;
            const usableW = Math.max(0, w - (CONFIG.MARGINS.WIDTH || 0));
            const usableC = Math.max(0, c - (CONFIG.MARGINS.CELLS || 0));

            return {
              ...m,
              widthNum: w,
              cellsNum: c,
              usableWidth: usableW,
              usableCells: usableC,
              remainingWidth: usableW,
              remainingCells: usableC,
              orientation: null,
              assignedOrders: []
            };
          });

        const groupsMap = {};
        orders.forEach(order => {
          const pcn = String(order.PCN_ID || order.pcnId).trim();
          const w = Number(order.WIDTH || order.width) || 0;
          const c = Number(order.CELLS || order.cells) || 0;
          const key = `${pcn}_${w}_${c}`;

          if (!groupsMap[key]) {
            groupsMap[key] = { pcnId: pcn, width: w, cells: c, orders: [] };
          }
          groupsMap[key].orders.push(order);
        });

        const orderGroups = Object.values(groupsMap).sort((a, b) => {
          return (b.width * b.cells * b.orders.length) - (a.width * a.cells * a.orders.length);
        });

        const unassignedOrders = [];
        let groupIndex = 0;
        const totalGroups = orderGroups.length;

        function processNextChunk() {
          const chunkSize = 10;
          const end = Math.min(groupIndex + chunkSize, totalGroups);

          for (; groupIndex < end; groupIndex++) {
            const group = orderGroups[groupIndex];
            const reqPcn = group.pcnId;
            const reqWidth = group.width;
            const reqCells = group.cells;
            let remainingInGroup = [...group.orders];

            while (remainingInGroup.length > 0) {
              let bestEvaluation = null;

              availableMaterials.forEach(mat => {
                if (String(mat.PCN_ID).trim() !== reqPcn) return;

                let maxWidthQty = 0;
                if (mat.orientation === null || mat.orientation === 'WIDTH') {
                  if (reqCells <= mat.usableCells) {
                    maxWidthQty = Math.floor(mat.remainingWidth / reqWidth);
                  }
                }

                let maxCellsQty = 0;
                const maxExistingW = mat.assignedOrders.reduce((max, o) => Math.max(max, o.width), 0);
                const allowCellsSwitch = (mat.orientation === null || mat.orientation === 'CELLS') || 
                                         (mat.orientation === 'WIDTH' && Math.max(maxExistingW, reqWidth) <= mat.usableWidth);

                if (allowCellsSwitch && reqWidth <= mat.usableWidth) {
                  const currentUsedCells = mat.assignedOrders.reduce((sum, o) => sum + o.cells, 0);
                  const remCells = mat.usableCells - currentUsedCells;
                  maxCellsQty = Math.floor(remCells / reqCells);
                }

                if (maxWidthQty === 0 && maxCellsQty === 0) return;

                let chosenOrientation = (maxWidthQty >= maxCellsQty && maxWidthQty > 0) ? 'WIDTH' : 'CELLS';
                let fitQty = (chosenOrientation === 'WIDTH') 
                  ? Math.min(maxWidthQty, remainingInGroup.length) 
                  : Math.min(maxCellsQty, remainingInGroup.length);

                const currentUsedArea = mat.assignedOrders.reduce((sum, o) => sum + (o.width * o.cells), 0);
                const addedArea = fitQty * (reqWidth * reqCells);
                const totalUsableArea = mat.usableWidth * mat.usableCells;
                const projectedUsedArea = currentUsedArea + addedArea;
                const projectedResidualPct = totalUsableArea > 0 ? Math.max(0, ((totalUsableArea - projectedUsedArea) / totalUsableArea) * 100) : 100;

                const evalItem = {
                  material: mat,
                  chosenOrientation: chosenOrientation,
                  fitQty: fitQty,
                  projectedResidualPct: projectedResidualPct
                };

                if (!bestEvaluation || isBetterOption(evalItem, bestEvaluation)) {
                  bestEvaluation = evalItem;
                }
              });

              if (!bestEvaluation || bestEvaluation.fitQty === 0) {
                remainingInGroup.forEach(o => {
                  unassignedOrders.push({
                    orderId: o.ORDER_ID || o.orderId,
                    orderDate: o.ORDER_DATE || o.orderDate,
                    pcnId: reqPcn,
                    width: reqWidth,
                    cells: reqCells,
                    reason: "NO_MATERIAL_AVAILABLE"
                  });
                });
                break;
              }

              const targetMat = bestEvaluation.material;
              const ordersToAssign = remainingInGroup.splice(0, bestEvaluation.fitQty);

              targetMat.orientation = bestEvaluation.chosenOrientation;
              ordersToAssign.forEach(o => {
                targetMat.assignedOrders.push({
                  orderId: o.ORDER_ID || o.orderId,
                  orderDate: o.ORDER_DATE || o.orderDate,
                  pcnId: reqPcn,
                  width: reqWidth,
                  cells: reqCells
                });
              });

              if (targetMat.orientation === 'WIDTH') {
                const usedW = targetMat.assignedOrders.reduce((sum, o) => sum + o.width, 0);
                targetMat.remainingWidth = Math.max(0, targetMat.usableWidth - usedW);
                targetMat.remainingCells = targetMat.usableCells;
              } else {
                const usedC = targetMat.assignedOrders.reduce((sum, o) => sum + o.cells, 0);
                targetMat.remainingCells = Math.max(0, targetMat.usableCells - usedC);
                targetMat.remainingWidth = targetMat.usableWidth;
              }
            }
          }

          if (typeof progressCallback === 'function' && totalGroups > 0) {
            const pct = Math.round((groupIndex / totalGroups) * 100);
            progressCallback(pct);
          }

          if (groupIndex < totalGroups) {
            setTimeout(processNextChunk, 15);
          } else {
            const proposedAssignments = [];
            availableMaterials.forEach(mat => {
              if (mat.assignedOrders.length > 0) {
                const totalArea = mat.widthNum * mat.cellsNum;
                const usedArea = mat.assignedOrders.reduce((sum, o) => sum + (o.width * o.cells), 0);
                const residualArea = Math.max(0, totalArea - usedArea);
                const residualPercentage = totalArea > 0 ? (residualArea / totalArea) * 100 : 0;

                let generatedSubRemanent = null;
                const matIdClean = mat["MATERIAL_ID"] || mat.MATERIAL_ID;
                const remW = (mat.orientation === 'WIDTH') ? mat.remainingWidth : mat.usableWidth;
                const remC = (mat.orientation === 'WIDTH') ? mat.usableCells : mat.remainingCells;

                if (remW >= 24 && remC >= 30) {
                  generatedSubRemanent = {
                    subMaterialId: `${matIdClean}-SUB1`,
                    parentMaterialId: matIdClean,
                    pcnId: mat.PCN_ID,
                    width: Number(remW.toFixed(3)),
                    cells: Number(remC.toFixed(3)),
                    rack: mat.RACK || '',
                    loc: mat.LOC || ''
                  };
                }

                proposedAssignments.push({
                  materialId: matIdClean,
                  pcnId: mat.PCN_ID,
                  rack: mat.RACK,
                  loc: mat.LOC,
                  originalWidth: mat.widthNum,
                  originalCells: mat.cellsNum,
                  remainingWidth: mat.remainingWidth,
                  remainingCells: mat.remainingCells,
                  orientation: mat.orientation || 'WIDTH',
                  residualPercentage: Number(residualPercentage.toFixed(2)),
                  status: mat.STATUS,
                  recordDate: mat.RECORD_DATE,
                  orders: mat.assignedOrders,
                  generatedSubRemanent: generatedSubRemanent
                });
              }
            });

            resolve({
              assignments: proposedAssignments,
              unassignedOrders: unassignedOrders
            });
          }
        }

        function isBetterOption(cand, currentBest) {
          const matA = cand.material;
          const matB = currentBest.material;

          if (matA.STATUS === 'AUDITADO' && matB.STATUS !== 'AUDITADO') return true;
          if (matA.STATUS !== 'AUDITADO' && matB.STATUS === 'AUDITADO') return false;

          if (cand.fitQty !== currentBest.fitQty) return cand.fitQty > currentBest.fitQty;

          const countA = matA.assignedOrders.length;
          const countB = matB.assignedOrders.length;
          if (countA > 0 && countB === 0) return true;
          if (countA === 0 && countB > 0) return false;

          if (Math.abs(cand.projectedResidualPct - currentBest.projectedResidualPct) > 0.1) {
            return cand.projectedResidualPct < currentBest.projectedResidualPct;
          }

          const dateA = new Date(matA.RECORD_DATE || 0);
          const dateB = new Date(matB.RECORD_DATE || 0);
          return dateA < dateB;
        }

        setTimeout(processNextChunk, 20);

      } catch (e) {
        reject(e);
      }
    });
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

    // Filtro Desperdicio > 20%
    if (filterHighResidualOnly) {
      assignmentsToRender = assignmentsToRender.filter(a => (a.residualPercentage || 0) > 20);
    }

    // REQUERIMIENTO 2: Filtro por ORDER_ID en Sobrantes Asignados
    if (filterAssignedOrderId) {
      assignmentsToRender = assignmentsToRender.filter(item => {
        return item.orders.some(o => 
          String(o.orderId || o.ORDER_ID || "").toLowerCase().includes(filterAssignedOrderId)
        );
      });
    }

    let html = `<div style="max-height: 580px; overflow-y: auto;">`;

    if (assignmentsToRender.length > 0) {
      const totalCount = currentProposal.assignments.length;
      const filteredCount = assignmentsToRender.length;
      const countLabel = (filterHighResidualOnly || filterAssignedOrderId) ? `${filteredCount} de ${totalCount}` : `${totalCount}`;

      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; flex-wrap: wrap;">
          <h4 style="color: #16a34a; margin: 0;">Sobrantes Asignados (${countLabel})</h4>
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 0.78rem; font-weight: bold; color: #475569; margin: 0;">🔍 Buscar ORDER_ID:</label>
            <input type="text" class="form-control" style="font-size: 0.8rem; height: 30px; width: 190px; font-family: monospace;" 
              placeholder="Filtra por orden..." 
              value="${filterAssignedOrderId}" 
              oninput="ValidatorView.filterAssignedOrders(this.value)">
          </div>
        </div>`;

      assignmentsToRender.forEach((item) => {
        const assignIdx = currentProposal.assignments.indexOf(item);
        const matIdClean = item.materialId || item["MATERIAL_ID"] || item.MATERIAL_ID || "N/A";
        const origWidth = Number(item.originalWidth || item.WIDTH || 1);
        const origCells = Number(item.originalCells || item.CELLS || 1);
        const rack = item.rack || item.RACK || "N/A";
        const loc = item.loc || item.LOC || "N/A";
        const status = item.status || item.STATUS || "N/A";
        const orientation = item.orientation || "WIDTH";
        const resPct = item.residualPercentage !== undefined ? item.residualPercentage : 0;
        
        const subRems = item.generatedSubRemanents || [];

        const badgeColor =
          status === "AUDITADO"
            ? "background: #dcfce7; color: #15803d;"
            : "background: #fef3c7; color: #b45309;";

        const resBadgeStyle = resPct > 20 
          ? "background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;" 
          : "background: #f1f5f9; color: #475569;";

        const isVertical = orientation === 'CELLS';
        const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];

        const subLateral = subRems.find(s => s.type === 'LATERAL');
        const subBottom = subRems.find(s => s.type === 'BOTTOM');

        const maxOrdersW = item.orders.reduce((max, o) => Math.max(max, o.width), 0);
        const sumOrdersW = item.orders.reduce((sum, o) => sum + o.width, 0);
        const sumOrdersC = item.orders.reduce((sum, o) => sum + o.cells, 0);
        const maxOrdersC = item.orders.reduce((max, o) => Math.max(max, o.cells), 0);

        const usedWidthPct = isVertical ? (maxOrdersW / origWidth) * 100 : (sumOrdersW / origWidth) * 100;
        const usedCellsPct = isVertical ? (sumOrdersC / origCells) * 100 : (maxOrdersC / origCells) * 100;

        html += `
          <div style="border: 2px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 16px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: #f8fafc; padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0;">
              <div>
                <span style="font-size: 0.75rem; font-weight: bold; color: #64748b; text-transform: uppercase;">SOBRANTE PADRE:</span>
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

            <!-- CONTENEDOR GEOMÉTRICO -->
            <div style="position: relative; width: 100%; height: 180px; background: #0f172a; border: 2px solid #475569; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; padding: 3px; gap: 3px;">
              
              <!-- BLOQUE SUPERIOR -->
              <div style="display: flex; width: 100%; height: ${Math.min(usedCellsPct, 100)}%; gap: 3px; overflow: hidden;">
                
                <!-- COLUMNA DE ÓRDENES -->
                <div style="width: ${Math.min(usedWidthPct, 100)}%; height: 100%; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; gap: 2px;">`;

        item.orders.forEach((ord, idx) => {
          const pieceDimension = isVertical ? Number(ord.cells) : Number(ord.width);
          const totalDimension = isVertical ? sumOrdersC : sumOrdersW;
          const pct = (pieceDimension / totalDimension) * 100 || 0;
          const bg = colors[idx % colors.length];

          const pieceStyle = isVertical 
            ? `width: 100%; height: ${pct}%;` 
            : `width: ${pct}%; height: 100%;`;

          html += `
            <div style="${pieceStyle} background: ${bg}; color: #fff; font-size: 0.75rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; overflow: hidden; padding: 2px 8px; border-radius: 2px;" title="Orden: ${ord.orderId} (${ord.width}W x ${ord.cells}C)">
              <span><b>${ord.orderId}</b></span>
              <span style="font-size: 0.68rem; opacity: 0.9;">${ord.width}W x ${ord.cells}C</span>
            </div>`;
        });

        html += `</div>`;

        // SUB-REMANENTE 1 (LATERAL)
        const latPct = Math.max(0, 100 - usedWidthPct);
        if (subLateral) {
          html += `
            <div style="width: ${latPct}%; height: 100%; background: #334155; border: 2px dashed #38bdf8; border-radius: 4px; color: #ffffff; font-size: 0.75rem; font-weight: bold; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 4px;" title="Nuevo Sobrante Resultante: ${subLateral.subMaterialId}">
              <span style="color: #38bdf8; font-size: 0.8rem; font-family: monospace;">✂️ ${subLateral.subMaterialId}</span>
              <span style="font-size: 0.7rem; color: #cbd5e1;">${subLateral.width}W x ${subLateral.cells}C</span>
            </div>`;
        } else if (latPct > 0) {
          html += `
            <div style="width: ${latPct}%; height: 100%; background: #0f172a; opacity: 0.5; color: #94a3b8; font-size: 0.65rem; display: flex; justify-content: center; align-items: center; text-align: center;">
              Merma (${latPct.toFixed(0)}%)
            </div>`;
        }

        html += `</div>`;

        // SUB-REMANENTE 2 (INFERIOR)
        const bottomPct = Math.max(0, 100 - usedCellsPct);
        if (subBottom) {
          html += `
            <div style="width: 100%; height: ${bottomPct}%; background: #334155; border: 2px dashed #38bdf8; border-radius: 4px; color: #ffffff; font-size: 0.75rem; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 8px;" title="Nuevo Sobrante Resultante: ${subBottom.subMaterialId}">
              <span style="color: #38bdf8; font-size: 0.8rem; font-family: monospace;">✂️ ${subBottom.subMaterialId}</span>
              <span style="font-size: 0.7rem; color: #cbd5e1;">(${subBottom.width}W x ${subBottom.cells}C)</span>
            </div>`;
        } else if (bottomPct > 0) {
          html += `
            <div style="width: 100%; height: ${bottomPct}%; background: #0f172a; opacity: 0.5; color: #94a3b8; font-size: 0.65rem; display: flex; justify-content: center; align-items: center;">
              Merma (${bottomPct.toFixed(0)}%)
            </div>`;
        }

        html += `</div></div>`;
      });

    } else if (filterHighResidualOnly || filterAssignedOrderId) {
      html += `<p style="color: #64748b; font-style: italic; padding: 10px;">No hay sobrantes asignados que coincidan con los filtros aplicados.</p>`;
    }

    // REQUERIMIENTO 1: Mapeo Completo y Filtro por ORDER_ID para Órdenes Sin Asignar
    if (currentProposal.unassignedOrders.length > 0 && !filterHighResidualOnly) {
      let unassignedList = currentProposal.unassignedOrders;

      if (filterUnassignedOrderId) {
        unassignedList = unassignedList.filter(u => 
          String(u.orderId || u.ORDER_ID || "").toLowerCase().includes(filterUnassignedOrderId)
        );
      }

      const totalUnassigned = currentProposal.unassignedOrders.length;
      const countUnassignedLabel = filterUnassignedOrderId ? `${unassignedList.length} de ${totalUnassigned}` : `${totalUnassigned}`;

      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; margin-bottom: 8px; gap: 10px; flex-wrap: wrap;">
          <h4 style="color: #dc2626; margin: 0;">Órdenes sin asignación encontrada (${countUnassignedLabel})</h4>
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 0.78rem; font-weight: bold; color: #475569; margin: 0;">🔍 Buscar ORDER_ID:</label>
            <input type="text" class="form-control" style="font-size: 0.8rem; height: 30px; width: 190px; font-family: monospace;" 
              placeholder="Filtra por orden..." 
              value="${filterUnassignedOrderId}" 
              oninput="ValidatorView.filterUnassignedOrders(this.value)">
          </div>
        </div>`;

      if (unassignedList.length === 0) {
        html += `<p style="color: #64748b; font-style: italic; padding: 10px;">No hay órdenes no asignadas que coincidan con el término "${filterUnassignedOrderId}".</p>`;
      } else {
        html += `<div style="max-height: 380px; overflow-y: auto; border: 1px solid #fee2e2; border-radius: 4px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <thead>
              <tr style="background: #fef2f2; color: #991b1b; text-align: left; position: sticky; top: 0; z-index: 1;">
                <th style="padding: 6px;">ORDER_ID</th>
                <th style="padding: 6px;">PCN</th>
                <th style="padding: 6px;">MEDIDAS</th>
                <th style="padding: 6px;">ACCIONES MANUALES</th>
              </tr>
            </thead>
            <tbody>`;

        // CORRECCIÓN: Renderizado completo sin truncar con .slice(0, 50)
        unassignedList.forEach((u) => {
          const rawIndex = currentProposal.unassignedOrders.indexOf(u);
          html += `
            <tr style="border-bottom: 1px solid #fee2e2;">
              <td style="padding: 6px; font-weight: bold; font-family: monospace; color: #dc2626;">${u.orderId}</td>
              <td style="padding: 6px;">${u.pcnId}</td>
              <td style="padding: 6px;">${u.width} W x ${u.cells} C</td>
              <td style="padding: 6px; display: flex; gap: 6px;">
                <button class="btn btn-sm btn-primary" onclick="ValidatorView.openSearchModalForOrder(${rawIndex})">Buscar en sistema</button>
                <button class="btn btn-sm btn-outline-danger" onclick="ValidatorView.removeUnassignedOrder(${rawIndex})">Eliminar</button>
              </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
      }
    }

    html += `</div>`;
    output.innerHTML = html;
  }

  function resetQueue() {
    pendingOrders = [];
    currentProposal = null;
    loadedFileSignature = null;
    filterAssignedOrderId = "";
    filterUnassignedOrderId = "";

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
        <div style="background: #fff; width: 90%; max-width: 680px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          
          <div style="flex-shrink: 0;">
            <h3 style="margin-top: 0; color: #1e293b;">📋 Resumen de Asignación por Lotes</h3>
            <p style="font-size: 0.85rem; color: #475569; margin-bottom: 12px;">
              Selecciona el modo de guardado. Se generará un <b>ID de Asignación</b> único con estatus inicial <b>ASIGNADO</b>.
            </p>
          </div>

          <div style="flex: 1; overflow-y: auto; padding-right: 6px; margin-bottom: 16px;">
            ${incompletePrefixes.length > 0 ? `
              <div style="background: #fefce8; border: 1px solid #fef08a; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.8rem;">
                <strong style="color: #854d0e;">⚠️ Lotes Incompletos:</strong>
                <ul style="margin: 6px 0 0 18px; padding: 0; color: #991b1b; max-height: 150px; overflow-y: auto;">${incompleteListHtml}</ul>
              </div>
            ` : ''}

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 6px; font-size: 0.8rem;">
              <strong style="color: #166534;">✅ Lotes Completos:</strong>
              <ul style="margin: 6px 0 0 18px; padding: 0; color: #15803d; max-height: 200px; overflow-y: auto;">${completeListHtml}</ul>
            </div>
          </div>

          <!-- BOTONES CON LAS 3 OPCIONES -->
          <div style="flex-shrink: 0; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-batch-confirm').remove()">
              Cancelar / Revisar
            </button>
            <button type="button" class="btn btn-warning" id="btn-save-complete-only">
              Guardar Completas
            </button>
            <button type="button" class="btn btn-success" id="btn-save-all">
              Guardar Todo
            </button>
          </div>

        </div>
      </div>
    `;

    const existing = document.getElementById("modal-batch-confirm");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    document.getElementById("btn-save-complete-only").onclick = async () => {
      document.getElementById("modal-batch-confirm").remove();
      
      const completeAssignments = currentProposal.assignments.filter(assignment => {
        return assignment.orders.every(ord => {
          const pref = String(ord.orderId || ord.ORDER_ID).substring(0, 10);
          return completePrefixes.includes(pref);
        });
      });

      if (completeAssignments.length === 0) {
        App.showToast("No hay asignaciones pertenecientes a lotes 100% completos.", "warning");
        return;
      }

      await executeCommitProcess(completeAssignments);
    };

    document.getElementById("btn-save-all").onclick = async () => {
      document.getElementById("modal-batch-confirm").remove();
      await executeCommitProcess(currentProposal.assignments);
    };
  }

  async function executeCommitProcess(assignmentsToSave) {
    if (!assignmentsToSave || assignmentsToSave.length === 0) {
      App.showToast("No hay asignaciones válidas para guardar.", "warning");
      return;
    }

    const formattedAssignments = assignmentsToSave.map(item => {
      // Determinar la dirección visual del acomodo basado en la orientación calculada por NestingEngine
      const isVertical = item.orientation === 'CELLS';
      const layoutTypeStr = isVertical ? "COLUMN" : "ROW";

      // Asignar el layoutType a cada orden individual
      const ordersWithLayout = (item.orders || []).map(ord => ({
        ...ord,
        layoutType: layoutTypeStr
      }));

      const subRems = (item.generatedSubRemanents || []).map(sub => {
        let typeStr = sub.type || sub.TYPE;
        if (!typeStr) {
          typeStr = String(sub.subMaterialId || "").includes("-SUB2") ? 'BOTTOM' : 'LATERAL';
        }
        return {
          ...sub,
          type: typeStr
        };
      });

      return {
        ...item,
        layoutType: layoutTypeStr,
        orders: ordersWithLayout,
        generatedSubRemanents: subRems
      };
    });

    const now = new Date();
    const timestampStr = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + "-" +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    
    const idAsignacion = `ASIG-${timestampStr}`;

    App.showLoader(`Guardando lote de asignaciones (${idAsignacion})...`);

    try {
      const res = await GasAPI.send("commitAssignments", { 
        idAsignacion: idAsignacion,
        assignments: formattedAssignments 
      });

      App.hideLoader();

      if (res && res.success) {
        App.showToast(`¡Asignaciones guardadas con éxito! ID: ${idAsignacion}`, "success");
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

  function openActivationModal() {
    const assignments = App.getDbTable("tbAsignaciones") || [];
    
    const pendingActivation = {};
    assignments.forEach(a => {
      const st = String(a.STATUS || a.status || "").trim();
      const asigId = String(a.ID_ASIGNACION || a.idAsignacion || "").trim();
      
      if (st === "ASIGNADO" && asigId) {
        if (!pendingActivation[asigId]) {
          pendingActivation[asigId] = {
            idAsignacion: asigId,
            fecha: a.RECORD_DATE || a.FECHA || "N/A",
            totalOrders: 0
          };
        }
        pendingActivation[asigId].totalOrders++;
      }
    });

    const activeList = Object.values(pendingActivation);

    let contentHtml = "";
    if (activeList.length === 0) {
      contentHtml = `<p style="color: #64748b; text-align: center; padding: 20px;">No hay lotes con estatus 'ASIGNADO' pendientes por activar.</p>`;
    } else {
      contentHtml = `
        <div style="max-height: 380px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left; position: sticky; top: 0;">
                <th style="padding: 8px;">ID_ASIGNACIÓN</th>
                <th style="padding: 8px;">FECHA REGISTRO</th>
                <th style="padding: 8px;">ÓRDENES</th>
                <th style="padding: 8px;">ACCIÓN</th>
              </tr>
            </thead>
            <tbody>`;

      activeList.forEach(item => {
        contentHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #2563eb;">${item.idAsignacion}</td>
            <td style="padding: 8px;">${item.fecha}</td>
            <td style="padding: 8px;">${item.totalOrders} órdenes</td>
            <td style="padding: 8px;">
              <button class="btn btn-sm btn-success" onclick="ValidatorView.executeActivation('${item.idAsignacion}')">
                Activar Lote
              </button>
            </td>
          </tr>`;
      });

      contentHtml += `</tbody></table></div>`;
    }

    const modalHtml = `
      <div id="modal-activation-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 650px; border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: #1e293b;">⚡ Activar asignación</h3>
            <button type="button" onclick="document.getElementById('modal-activation-popup').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>
          <p style="font-size: 0.85rem; color: #475569; margin-bottom: 12px;">
            Selecciona un lote de asignación para cambiar su estatus a <b>ACTIVADO</b> y liberarlo para la estación de optimización.
          </p>
          ${contentHtml}
          <div style="text-align: right; margin-top: 15px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-activation-popup').remove()">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-activation-popup");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  async function executeActivation(idAsignacion) {
    App.showLoader(`Activando asignación ${idAsignacion}...`);

    try {
      const res = await GasAPI.send("activateAssignmentGroup", { idAsignacion: idAsignacion });
      App.hideLoader();

      if (res && res.success) {
        App.showToast(`Lote ${idAsignacion} activado con éxito.`, "success");
        const pop = document.getElementById("modal-activation-popup");
        if (pop) pop.remove();
        await App.refreshDatabase();
      } else {
        App.showToast("Error activando asignación: " + (res?.message || "Error desconocido"), "error");
      }
    } catch (err) {
      App.hideLoader();
      App.showToast("Error al conectar con el servidor: " + err.message, "error");
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
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ACCIONES</th>
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
        const stId = row.STANDBY_ID || row.standbyKey || "";

        tableContent += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #2563eb;">${orderId}</td>
            <td style="padding: 8px;">${pcnId}</td>
            <td style="padding: 8px;">${width}W x ${cells}C</td>
            <td style="padding: 8px;"><span class="badge" style="background: #fef3c7; color: #b45309;">${reason}</span></td>
            <td style="padding: 8px;">${fecha}</td>
            <td style="padding: 8px; display: flex; gap: 4px;">
              <button class="btn btn-sm btn-primary" onclick="ValidatorView.reprocessStandbyItem('${orderId}', '${pcnId}', ${width}, ${cells}, '${stId}')" title="Cargar a cola de asignación">
                🔄 Procesar
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="ValidatorView.deleteStandbyItem('${stId}', '${orderId}')" title="Eliminar de Standby">
                🗑️
              </button>
            </td>
          </tr>`;
      });

      tableContent += `</tbody></table></div>`;
    }

    const modalHtml = `
      <div id="modal-standby-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 900px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">Órdenes pendientes (Standby)</h3>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-success" style="font-size: 0.8rem;" onclick="ValidatorView.exportStandbyToCSV()">
                Exportar CSV
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

  async function reprocessStandbyItem(orderId, pcnId, width, cells, standbyId) {
    if (pendingOrders.some(o => String(o.ORDER_ID || o.orderId) === String(orderId))) {
      App.showToast(`La orden ${orderId} ya está en la cola activa.`, "warning");
      return;
    }

    const nowFormatted = new Date().toLocaleString("en-US", { timeZone: "UTC" });
    pendingOrders.push({
      ORDER_ID: orderId,
      ORDER_DATE: nowFormatted,
      PCN_ID: pcnId,
      WIDTH: Number(width),
      CELLS: Number(cells),
    });

    if (standbyId) {
      await GasAPI.send("removeFromStandby", { standbyIds: [standbyId] });
    }

    const pop = document.getElementById("modal-standby-popup");
    if (pop) pop.remove();

    App.showToast(`Orden ${orderId} agregada de Standby a la cola activa.`, "success");
    processProposalAsync();
  }

  async function deleteStandbyItem(standbyId, orderId) {
    if (!confirm(`¿Deseas eliminar la orden ${orderId} de Standby?`)) return;

    App.showLoader("Eliminando de Standby...");
    const res = await GasAPI.send("removeFromStandby", { standbyIds: [standbyId] });
    App.hideLoader();

    if (res && res.success) {
      App.showToast(`Orden ${orderId} eliminada de Standby.`, "success");
      await App.refreshDatabase();
      openStandbyModal();
    } else {
      App.showToast("Error eliminando de Standby: " + (res?.message || "Error desconocido"), "error");
    }
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

    if (assignments.length === 0) {
      const emptyModalHtml = `
        <div id="modal-assignments-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
          <div style="background: #fff; width: 90%; max-width: 900px; border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="margin: 0;">Historial de asignaciones</h3>
              <button type="button" onclick="document.getElementById('modal-assignments-popup').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
            <p style="color: #64748b; text-align: center; padding: 20px;">No hay registros guardados en tbAsignaciones.</p>
            <div style="text-align: right; margin-top: 15px;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-assignments-popup').remove()">Cerrar</button>
            </div>
          </div>
        </div>`;
      const existing = document.getElementById("modal-assignments-popup");
      if (existing) existing.remove();
      document.body.insertAdjacentHTML("beforeend", emptyModalHtml);
      return;
    }

    const idSet = new Set();
    assignments.forEach(row => {
      const idAsig = String(row.ID_ASIGNACION || row.idAsignacion || "").trim();
      if (idAsig) idSet.add(idAsig);
    });

    let optionsHtml = `<option value="ALL">-- Todos los Lotes (${idSet.size}) --</option>`;
    Array.from(idSet).sort().reverse().forEach(id => {
      optionsHtml += `<option value="${id}">${id}</option>`;
    });

    const modalHtml = `
      <div id="modal-assignments-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #fff; width: 90%; max-width: 1050px; max-height: 85vh; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 15px; flex-wrap: wrap;">
            <div>
              <h3 style="margin: 0; color: #1e293b;">Historial de asignaciones</h3>
              <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0 0;">Filtra por corrida o exporta los registros actuales.</p>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 6px; background: #f8fafc; padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                <label style="font-size: 0.78rem; font-weight: bold; color: #334155; margin: 0;">Filtrar ID_Asignación:</label>
                <select id="select-filter-id-asignacion" class="form-control" style="font-size: 0.8rem; height: 32px; width: 220px; font-family: monospace;" onchange="ValidatorView.filterAssignmentsTable(this.value)">
                  ${optionsHtml}
                </select>
              </div>

              <button type="button" class="btn btn-success" style="font-size: 0.8rem; height: 32px;" onclick="ValidatorView.exportAssignmentsToCSV()">
                📥 Exportar
              </button>
              <button type="button" onclick="document.getElementById('modal-assignments-popup').remove()" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
          </div>

          <div id="container-assignments-table" style="flex: 1; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px;">
          </div>

          <div style="text-align: right; margin-top: 12px; flex-shrink: 0;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-assignments-popup').remove()">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById("modal-assignments-popup");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    filterAssignmentsTable("ALL");
  }

  function filterAssignmentsTable(selectedId) {
    const container = document.getElementById("container-assignments-table");
    if (!container) return;

    const assignments = App.getDbTable("tbAsignaciones") || [];
    let filtered = assignments;

    if (selectedId && selectedId !== "ALL") {
      filtered = assignments.filter(row => {
        const idAsig = String(row.ID_ASIGNACION || row.idAsignacion || "").trim();
        return idAsig === selectedId;
      });
    }

    if (filtered.length === 0) {
      container.innerHTML = `<p style="color: #64748b; text-align: center; padding: 20px;">No se encontraron registros para el filtro seleccionado.</p>`;
      return;
    }

    let tableHtml = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
        <thead>
          <tr style="background: #f1f5f9; text-align: left; position: sticky; top: 0; z-index: 1;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ID_ASIGNACIÓN</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MATERIAL_ID</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">FECHA REGISTRO</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ORDER_ID</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">PCN_ID</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">UBICACIÓN</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">MEDIDAS</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1;">ESTATUS</th>
          </tr>
        </thead>
        <tbody>`;

    filtered.forEach((row) => {
      const idAsig = String(row.ID_ASIGNACION || row.idAsignacion || "N/A");
      const matId = String(row.MATERIAL_ID || row.materialId || "N/A");
      const fecha = row.RECORD_DATE || row.FECHA || "N/A";
      const orderId = String(row.ORDER_ID || row.orderId || "N/A");
      const pcnId = row.PCN_ID || row.pcnId || "N/A";
      const rack = row.RACK || row.rack || "N/A";
      const loc = row.LOC || row.loc || "N/A";
      const width = row.WIDTH || row.width || "0";
      const cells = row.CELLS || row.cells || "0";
      const status = row.STATUS || row.status || "ASIGNADO";

      const statusStyle = status === "ACTIVADO" 
        ? "background: #dcfce7; color: #15803d;" 
        : "background: #e0f2fe; color: #0369a1;";

      tableHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #0284c7;">${idAsig}</td>
          <td style="padding: 8px; font-weight: bold; font-family: monospace; color: #2563eb;">${matId}</td>
          <td style="padding: 8px;">${fecha}</td>
          <td style="padding: 8px; font-weight: bold; font-family: monospace;">${orderId}</td>
          <td style="padding: 8px;">${pcnId}</td>
          <td style="padding: 8px;">${rack}-${loc}</td>
          <td style="padding: 8px;">${width}W x ${cells}C</td>
          <td style="padding: 8px;"><span class="badge" style="${statusStyle}">${status}</span></td>
        </tr>`;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
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
    filterAssignedOrders: filterAssignedOrders,
    filterUnassignedOrders: filterUnassignedOrders,
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
    filterAssignmentsTable: filterAssignmentsTable,
    openStandbyModal: openStandbyModal,
    reprocessStandbyItem: reprocessStandbyItem,
    deleteStandbyItem: deleteStandbyItem,
    exportStandbyToCSV: exportStandbyToCSV,
    openAssignmentsModal: openAssignmentsModal,
    exportAssignmentsToCSV: exportAssignmentsToCSV,
    openActivationModal: openActivationModal,
    executeActivation: executeActivation,
  };
})();

function closeModal() {
  const modal = document.getElementById("app-modal");
  if (modal) modal.classList.add("hidden");
}
