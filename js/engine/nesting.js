/**
 * Frontend - Motor de Optimización Dimensional (Nesting Algorithm)
 * Archivo: js/engine/nesting.js
 */

const NestingEngine = (function() {

  function calculateAssignments(inventory, orders) {
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
          usedArea: 0,
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

    orderGroups.forEach(group => {
      const reqPcn = group.pcnId;
      const reqWidth = group.width;
      const reqCells = group.cells;
      let remainingOrders = [...group.orders];

      while (remainingOrders.length > 0) {
        let bestMat = null;
        let bestOrientation = null;
        let bestFitQty = 0;
        let bestResidualPct = 100;

        for (let i = 0; i < availableMaterials.length; i++) {
          const mat = availableMaterials[i];
          if (String(mat.PCN_ID).trim() !== reqPcn) continue;

          let fitWidth = 0;
          if (mat.orientation === null || mat.orientation === 'WIDTH') {
            if (reqCells <= mat.usableCells) {
              fitWidth = Math.floor(mat.remainingWidth / reqWidth);
            }
          }

          let fitCells = 0;
          if ((mat.orientation === null || mat.orientation === 'CELLS') && reqWidth <= mat.usableWidth) {
            fitCells = Math.floor(mat.remainingCells / reqCells);
          }

          if (fitWidth === 0 && fitCells === 0) continue;

          let orient = (fitWidth >= fitCells && fitWidth > 0) ? 'WIDTH' : 'CELLS';
          let qty = Math.min(orient === 'WIDTH' ? fitWidth : fitCells, remainingOrders.length);

          const totalUsableArea = mat.usableWidth * mat.usableCells;
          const projectedArea = mat.usedArea + (qty * reqWidth * reqCells);
          const residualPct = totalUsableArea > 0 ? ((totalUsableArea - projectedArea) / totalUsableArea) * 100 : 100;

          let isBetter = false;
          if (!bestMat) {
            isBetter = true;
          } else {
            if (mat.STATUS === 'AUDITADO' && bestMat.STATUS !== 'AUDITADO') isBetter = true;
            else if (mat.STATUS !== 'AUDITADO' && bestMat.STATUS === 'AUDITADO') isBetter = false;
            else if (qty !== bestFitQty) isBetter = qty > bestFitQty;
            else if (mat.assignedOrders.length > 0 && bestMat.assignedOrders.length === 0) isBetter = true;
            else if (mat.assignedOrders.length === 0 && bestMat.assignedOrders.length > 0) isBetter = false;
            else if (Math.abs(residualPct - bestResidualPct) > 0.1) isBetter = residualPct < bestResidualPct;
          }

          if (isBetter) {
            bestMat = mat;
            bestOrientation = orient;
            bestFitQty = qty;
            bestResidualPct = residualPct;
          }
        }

        if (!bestMat || bestFitQty === 0) {
          remainingOrders.forEach(o => unassignedOrders.push({
            orderId: o.ORDER_ID || o.orderId,
            orderDate: o.ORDER_DATE || o.orderDate,
            pcnId: reqPcn,
            width: reqWidth,
            cells: reqCells,
            reason: "NO_MATERIAL_AVAILABLE"
          }));
          break;
        }

        const assigned = remainingOrders.splice(0, bestFitQty);
        bestMat.orientation = bestOrientation;

        assigned.forEach(o => {
          bestMat.assignedOrders.push({
            orderId: o.ORDER_ID || o.orderId,
            orderDate: o.ORDER_DATE || o.orderDate,
            pcnId: reqPcn,
            width: reqWidth,
            cells: reqCells
          });
        });

        bestMat.usedArea += (bestFitQty * reqWidth * reqCells);

        if (bestOrientation === 'WIDTH') {
          bestMat.remainingWidth = Math.max(0, bestMat.remainingWidth - (bestFitQty * reqWidth));
        } else {
          bestMat.remainingCells = Math.max(0, bestMat.remainingCells - (bestFitQty * reqCells));
        }
      }
    });

    // 4. CÁLCULO PRECISO DE SUB-REMANENTES (MÍNIMO 24W x 30C)
    const proposedAssignments = [];
    availableMaterials.forEach(mat => {
      if (mat.assignedOrders.length > 0) {
        const totalArea = mat.widthNum * mat.cellsNum;
        const usedArea = mat.assignedOrders.reduce((s, o) => s + (o.width * o.cells), 0);
        const residualArea = Math.max(0, totalArea - usedArea);
        const residualPercentage = totalArea > 0 ? (residualArea / totalArea) * 100 : 0;

        const generatedSubRemanents = [];
        const matIdClean = mat["MATERIAL_ID"] || mat.MATERIAL_ID;

        if (mat.orientation === 'CELLS') {
          const maxOrdersW = mat.assignedOrders.reduce((max, o) => Math.max(max, o.width), 0);
          const sumOrdersC = mat.assignedOrders.reduce((sum, o) => sum + o.cells, 0);

          // 1. Sub-remanente Lateral (si la franja libre de ancho es >= 24W y la altura acumulada es >= 30C)
          const sideW = mat.widthNum - maxOrdersW;
          const sideC = sumOrdersC;
          if (sideW >= 24 && sideC >= 30) {
            generatedSubRemanents.push({
              subMaterialId: `${matIdClean}-SUB1`,
              parentMaterialId: matIdClean,
              pcnId: mat.PCN_ID,
              width: Number(sideW.toFixed(3)),
              cells: Number(sideC.toFixed(3)),
              rack: mat.RACK || '',
              loc: mat.LOC || '',
              type: 'LATERAL'
            });
          }

          // 2. Sub-remanente Inferior (si el fondo del sobrante que no se usó es >= 24W y >= 30C)
          const bottomW = mat.widthNum;
          const bottomC = mat.cellsNum - sumOrdersC;
          if (bottomW >= 24 && bottomC >= 30) {
            const subSuffix = generatedSubRemanents.length > 0 ? '-SUB2' : '-SUB1';
            generatedSubRemanents.push({
              subMaterialId: `${matIdClean}${subSuffix}`,
              parentMaterialId: matIdClean,
              pcnId: mat.PCN_ID,
              width: Number(bottomW.toFixed(3)),
              cells: Number(bottomC.toFixed(3)),
              rack: mat.RACK || '',
              loc: mat.LOC || '',
              type: 'BOTTOM'
            });
          }
        } else {
          // Orientación HORIZONTAL ('WIDTH')
          const sumOrdersW = mat.assignedOrders.reduce((sum, o) => sum + o.width, 0);
          const maxOrdersC = mat.assignedOrders.reduce((max, o) => Math.max(max, o.cells), 0);

          // 1. Sub-remanente Inferior
          const bottomW = sumOrdersW;
          const bottomC = mat.cellsNum - maxOrdersC;
          if (bottomW >= 24 && bottomC >= 30) {
            generatedSubRemanents.push({
              subMaterialId: `${matIdClean}-SUB1`,
              parentMaterialId: matIdClean,
              pcnId: mat.PCN_ID,
              width: Number(bottomW.toFixed(3)),
              cells: Number(bottomC.toFixed(3)),
              rack: mat.RACK || '',
              loc: mat.LOC || '',
              type: 'BOTTOM'
            });
          }

          // 2. Sub-remanente Lateral
          const sideW = mat.widthNum - sumOrdersW;
          const sideC = mat.cellsNum;
          if (sideW >= 24 && sideC >= 30) {
            const subSuffix = generatedSubRemanents.length > 0 ? '-SUB2' : '-SUB1';
            generatedSubRemanents.push({
              subMaterialId: `${matIdClean}${subSuffix}`,
              parentMaterialId: matIdClean,
              pcnId: mat.PCN_ID,
              width: Number(sideW.toFixed(3)),
              cells: Number(sideC.toFixed(3)),
              rack: mat.RACK || '',
              loc: mat.LOC || '',
              type: 'LATERAL'
            });
          }
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
          generatedSubRemanents: generatedSubRemanents
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
