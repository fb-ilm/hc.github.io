/**
 * Frontend - Motor de Optimización Dimensional (Nesting Algorithm)
 * Archivo: js/engine/nesting.js
 */

const NestingEngine = (function() {

  /**
   * Ejecuta el cálculo masivo de propuestas de asignación
   * @param {Array} inventory Lista de sobrantes disponibles de tbInventario
   * @param {Array} orders Lista de órdenes ingresadas o cargadas
   */
  function calculateAssignments(inventory, orders) {
    // 1. Filtrar solo sobrantes válidos (excluir estatus 'ELIMINADO')
    let availableMaterials = inventory.filter(m => m.STATUS !== 'ELIMINADO').map(m => ({
      ...m,
      widthNum: Number(m.WIDTH) || 0,
      cellsNum: Number(m.CELLS) || 0,
      // Dimensiones residuales aprovechables (restando márgenes mínimos de corte)
      remainingWidth: (Number(m.WIDTH) || 0) - CONFIG.MARGINS.WIDTH,
      remainingCells: (Number(m.CELLS) || 0) - CONFIG.MARGINS.CELLS,
      assignedOrders: []
    }));

    // 2. Ordenar las órdenes procesadas por ORDER_DATE más reciente (Criterio 1)
    const sortedOrders = [...orders].sort((a, b) => {
      const dateA = new Date(a.ORDER_DATE || 0);
      const dateB = new Date(b.ORDER_DATE || 0);
      return dateB - dateA;
    });

    const proposedAssignments = []; // Materiales con sus órdenes agrupadas
    const unassignedOrders = [];     // Órdenes que no cupieron -> Standby

    // 3. Iterar cada orden e intentar acomodarla en los sobrantes
    sortedOrders.forEach(order => {
      const reqPcn = String(order.PCN_ID).trim();
      const reqWidth = Number(order.WIDTH) || 0;
      const reqCells = Number(order.CELLS) || 0;
      const orderId = order.ORDER_ID || ("ORD-" + Math.floor(Math.random() * 1000000));

      // Filtrar sobrantes candidatos compatibles por PCN y capacidad residual
      let candidates = availableMaterials.filter(mat => {
        const matPcn = String(mat.PCN_ID).trim();
        if (matPcn !== reqPcn) return false;

        // Permite acumulación sobre WIDTH o sobre CELLS siempre que ambas dimensiones quepan con sus márgenes
        const fitsWidthSum = (mat.remainingWidth >= reqWidth) && (mat.remainingCells >= reqCells);
        return fitsWidthSum;
      });

      if (candidates.length === 0) {
        // No hubo material compatible disponible
        unassignedOrders.push({
          orderId: orderId,
          orderDate: order.ORDER_DATE,
          pcnId: reqPcn,
          width: reqWidth,
          cells: reqCells,
          reason: "NO_MATERIAL_AVAILABLE"
        });
        return;
      }

      // 4. Ordenar candidatos según criterios de prioridad (2 al 5)
      candidates.sort((a, b) => {
        // Criterio 2: Estatus AUDITADO primero
        if (a.STATUS === 'AUDITADO' && b.STATUS !== 'AUDITADO') return -1;
        if (a.STATUS !== 'AUDITADO' && b.STATUS === 'AUDITADO') return 1;

        // Criterio 3: Menor desperdicio residual que dejaría la incorporación de esta orden
        const residualA = (a.remainingWidth - reqWidth) + (a.remainingCells - reqCells);
        const residualB = (b.remainingWidth - reqWidth) + (b.remainingCells - reqCells);
        if (residualA !== residualB) return residualA - residualB;

        // Criterio 4: Antigüedad del sobrante (RECORD_DATE más antiguo primero)
        const dateA = new Date(a.RECORD_DATE || 0);
        const dateB = new Date(b.RECORD_DATE || 0);
        if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;

        // Criterio 5: Mayor dimensión original en caso de empate
        const sizeA = a.widthNum * a.cellsNum;
        const sizeB = b.widthNum * b.cellsNum;
        return sizeB - sizeA;
      });

      // Seleccionar el mejor sobrante
      const bestMaterial = candidates[0];

      // Asignar orden al sobrante seleccionado
      bestMaterial.assignedOrders.push({
        orderId: orderId,
        orderDate: order.ORDER_DATE,
        pcnId: reqPcn,
        width: reqWidth,
        cells: reqCells
      });

      // Actualizar espacio residual del sobrante
      bestMaterial.remainingWidth -= reqWidth;
    });

    // 5. Agrupar propuesta final con materiales que recibieron al menos una orden
    availableMaterials.forEach(mat => {
      if (mat.assignedOrders.length > 0) {
        proposedAssignments.push({
          materialId: mat["MATERIAL_ID"],
          pcnId: mat.PCN_ID,
          rack: mat.RACK,
          loc: mat.LOC,
          originalWidth: mat.widthNum,
          originalCells: mat.cellsNum,
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