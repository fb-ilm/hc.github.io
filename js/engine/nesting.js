/**
 * Frontend - Motor de Optimización Dimensional (Nesting Algorithm)
 * Archivo: js/engine/nesting.js
 */

const NestingEngine = (function() {

  function calculateAssignments(inventory, orders) {
    // 1. Pre-procesar remanentes disponibles con sus márgenes
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
          orientation: null, // 'WIDTH' | 'CELLS'
          assignedOrders: []
        };
      });

    // 2. AGRUPAMIENTO INTELIGENTE: Agrupar órdenes idénticas por (PCN_ID + WIDTH + CELLS)
    const groupsMap = {};

    orders.forEach(order => {
      const pcn = String(order.PCN_ID).trim();
      const w = Number(order.WIDTH) || 0;
      const c = Number(order.CELLS) || 0;
      const key = `${pcn}_${w}_${c}`;

      if (!groupsMap[key]) {
        groupsMap[key] = {
          pcnId: pcn,
          width: w,
          cells: c,
          orders: []
        };
      }
      groupsMap[key].orders.push(order);
    });

    // Convertir a arreglo y ordenar los grupos (los grupos con piezas más grandes o más volumen van primero)
    const orderGroups = Object.values(groupsMap).sort((a, b) => {
      const areaA = a.width * a.cells * a.orders.length;
      const areaB = b.width * b.cells * b.orders.length;
      return areaB - areaA; // Mayor volumen total primero
    });

    const unassignedOrders = [];

    // 3. Procesar Grupo por Grupo
    orderGroups.forEach(group => {
      const reqPcn = group.pcnId;
      const reqWidth = group.width;
      const reqCells = group.cells;
      let remainingInGroup = [...group.orders];

      // Bucle mientras queden órdenes por asignar en este grupo específico
      while (remainingInGroup.length > 0) {
        let bestEvaluation = null;

        // Evaluar todos los sobrantes para encontrar el óptimo para este lote de piezas idénticas
        availableMaterials.forEach(mat => {
          const matPcn = String(mat.PCN_ID).trim();
          if (matPcn !== reqPcn) return;

          // --- EVALUAR CAPACIDAD MÁXIMA EN EJE WIDTH (Apilado Horizontal) ---
          let maxWidthQty = 0;
          if (mat.orientation === null || mat.orientation === 'WIDTH') {
            if (reqCells <= mat.usableCells) {
              maxWidthQty = Math.floor(mat.remainingWidth / reqWidth);
            }
          }

          // --- EVALUAR CAPACIDAD MÁXIMA EN EJE CELLS (Apilado Vertical) ---
          let maxCellsQty = 0;
          const maxExistingWidthInCells = mat.assignedOrders.reduce((max, o) => Math.max(max, o.width), 0);
          const allowCellsSwitch = (mat.orientation === null || mat.orientation === 'CELLS') || 
                                   (mat.orientation === 'WIDTH' && Math.max(maxExistingWidthInCells, reqWidth) <= mat.usableWidth);

          if (allowCellsSwitch && reqWidth <= mat.usableWidth) {
            const currentUsedCells = mat.assignedOrders.reduce((sum, o) => sum + o.cells, 0);
            const remCells = mat.usableCells - currentUsedCells;
            maxCellsQty = Math.floor(remCells / reqCells);
          }

          const canFit = (maxWidthQty > 0) || (maxCellsQty > 0);
          if (!canFit) return;

          // Determinar mejor orientación y cuántas piezas del lote entrarían
          let chosenOrientation = 'CELLS';
          let fitQty = 0;

          if (maxWidthQty >= maxCellsQty && maxWidthQty > 0) {
            chosenOrientation = 'WIDTH';
            fitQty = Math.min(maxWidthQty, remainingInGroup.length);
          } else {
            chosenOrientation = 'CELLS';
            fitQty = Math.min(maxCellsQty, remainingInGroup.length);
          }

          // Simular desperdicio residual si metemos 'fitQty' piezas en este sobrante
          const currentUsedArea = mat.assignedOrders.reduce((sum, o) => sum + (o.width * o.cells), 0);
          const addedArea = fitQty * (reqWidth * reqCells);
          const totalUsableArea = mat.usableWidth * mat.usableCells;
          const projectedUsedArea = currentUsedArea + addedArea;
          
          const projectedResidualPct = totalUsableArea > 0 
            ? Math.max(0, ((totalUsableArea - projectedUsedArea) / totalUsableArea) * 100)
            : 100;

          const evalItem = {
            material: mat,
            chosenOrientation: chosenOrientation,
            fitQty: fitQty,
            projectedResidualPct: projectedResidualPct
          };

          // Criterios de Selección
          if (!bestEvaluation || isBetterOption(evalItem, bestEvaluation)) {
            bestEvaluation = evalItem;
          }
        });

        // Si ninguna opción pudo meter al menos 1 orden del grupo, se marcan como no asignadas
        if (!bestEvaluation || bestEvaluation.fitQty === 0) {
          remainingInGroup.forEach(o => {
            unassignedOrders.push({
              orderId: o.ORDER_ID || o.orderId,
              orderDate: o.ORDER_DATE,
              pcnId: reqPcn,
              width: reqWidth,
              cells: reqCells,
              reason: "NO_MATERIAL_AVAILABLE"
            });
          });
          break; // Salir del while para este grupo
        }

        // Aplicar la mejor asignación encontrada
        const targetMat = bestEvaluation.material;
        const ordersToAssign = remainingInGroup.splice(0, bestEvaluation.fitQty);

        targetMat.orientation = bestEvaluation.chosenOrientation;
        ordersToAssign.forEach(o => {
          targetMat.assignedOrders.push({
            orderId: o.ORDER_ID || o.orderId,
            orderDate: o.ORDER_DATE,
            pcnId: reqPcn,
            width: reqWidth,
            cells: reqCells
          });
        });

        // Actualizar dimensiones remanentes en el sobrante
        if (targetMat.orientation === 'WIDTH') {
          const usedWidth = targetMat.assignedOrders.reduce((sum, o) => sum + o.width, 0);
          targetMat.remainingWidth = Math.max(0, targetMat.usableWidth - usedWidth);
          targetMat.remainingCells = targetMat.usableCells;
        } else {
          const usedCells = targetMat.assignedOrders.reduce((sum, o) => sum + o.cells, 0);
          targetMat.remainingCells = Math.max(0, targetMat.usableCells - usedCells);
          targetMat.remainingWidth = targetMat.usableWidth;
        }
      }
    });

    // Función auxiliar para comparar cuál opción es mejor
    function isBetterOption(cand, currentBest) {
      const matA = cand.material;
      const matB = currentBest.material;

      // Criterio 1: Estatus AUDITADO primero (prioridad a sobrantes liberados de standby)
      if (matA.STATUS === 'AUDITADO' && matB.STATUS !== 'AUDITADO') return true;
      if (matA.STATUS !== 'AUDITADO' && matB.STATUS === 'AUDITADO') return false;

      // Criterio 2: Mayor cantidad de piezas del lote acomodadas juntas en una sola tira
      if (cand.fitQty !== currentBest.fitQty) {
        return cand.fitQty > currentBest.fitQty;
      } 

      // Criterio 3: Sobrantes que ya tienen órdenes (prioridad a llenar el sobrante abierto)
      const countA = matA.assignedOrders.length;
      const countB = matB.assignedOrders.length;
      if (countA > 0 && countB === 0) return true;
      if (countA === 0 && countB > 0) return false;

      // Criterio 4: Menor porcentaje de residuo libre
      if (Math.abs(cand.projectedResidualPct - currentBest.projectedResidualPct) > 0.1) {
        return cand.projectedResidualPct < currentBest.projectedResidualPct;
      }

      // Criterio 5: Remanente más antiguo (RECORD_DATE)
      const dateA = new Date(matA.RECORD_DATE || 0);
      const dateB = new Date(matB.RECORD_DATE || 0);
      return dateA < dateB;
    }

    // 4. Formatear la salida con el porcentaje de residuo final
    const proposedAssignments = [];
    availableMaterials.forEach(mat => {
      if (mat.assignedOrders.length > 0) {
        const totalArea = mat.widthNum * mat.cellsNum;
        const usedArea = mat.assignedOrders.reduce((sum, o) => sum + (o.width * o.cells), 0);
        const residualArea = Math.max(0, totalArea - usedArea);
        const residualPercentage = totalArea > 0 ? (residualArea / totalArea) * 100 : 0;

        proposedAssignments.push({
          materialId: mat["MATERIAL_ID"] || mat.MATERIAL_ID,
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
          orders: mat.assignedOrders
        });
      }
    });

    return {
      assignments: proposedAssignments,
      unassignedOrders: unassignedOrders
    };
  }

  return {
    calculateAssignments: calculateAssignments
  };
})();
