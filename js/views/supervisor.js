/**
 * Frontend - Vista para Rol Supervisor
 * Archivo: js/views/supervisor.js
 */

const SupervisorView = (function() {

  function render(container) {
    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px;">
        <h2>Gestión de Inventario y Cargas Masivas</h2>
        <p class="text-muted">Sube actualizaciones masivas a la base de datos divididas por paquetes (Chunks).</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
        <!-- CARGA DE INVENTARIO -->
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <h3>Cargar 'tbInventario' (CSV)</h3>
          <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 12px;">
            Añade nuevos sobrantes a la base de datos sin sobreescribir los existentes.
          </p>
          <input type="file" id="file-inventory-csv" accept=".csv" class="form-control" style="margin-bottom: 12px;">
          <button class="btn btn-primary btn-block" onclick="SupervisorView.uploadInventory()">
            Procesar Carga de Inventario
          </button>
          
          <div id="progress-inv-container" class="hidden" style="margin-top: 12px;">
            <div style="background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
              <div id="progress-inv-bar" style="background: #2563eb; width: 0%; height: 100%; transition: width 0.2s;"></div>
            </div>
            <p id="progress-inv-text" style="font-size: 0.8rem; text-align: center; margin-top: 4px; color: #64748b;">0%</p>
          </div>
        </div>

        <!-- CARGA DE AUDITORÍA -->
        <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <h3>Cargar 'tbAuditoria' (CSV)</h3>
          <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 12px;">
            Reemplaza la auditoría física. Ejecuta el cruce automático de estatus AUDITADO / NO AUDITADO.
          </p>
          <input type="file" id="file-audit-csv" accept=".csv" class="form-control" style="margin-bottom: 12px;">
          <button class="btn btn-primary btn-block" onclick="SupervisorView.uploadAudit()">
            Procesar Carga de Auditoría
          </button>

          <div id="progress-aud-container" class="hidden" style="margin-top: 12px;">
            <div style="background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
              <div id="progress-aud-bar" style="background: #16a34a; width: 0%; height: 100%; transition: width 0.2s;"></div>
            </div>
            <p id="progress-aud-text" style="font-size: 0.8rem; text-align: center; margin-top: 4px; color: #64748b;">0%</p>
          </div>
        </div>
      </div>

      <!-- VISTA RECIENTE DE SOBRANTES ASIGNADOS -->
      <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
        <h3>Consulta de Sobrantes Asignados / Eliminados</h3>
        <hr style="margin: 12px 0;">
        <div id="assigned-materials-table">Cargando datos...</div>
      </div>
    `;

    renderAssignedMaterials();
  }

  async function uploadInventory() {
    const fileInput = document.getElementById("file-inventory-csv");
    if (!fileInput.files.length) return App.showToast("Selecciona un archivo CSV de inventario.", "error");

    try {
      const required = ["MATERIAL_ID", "PCN_ID", "WIDTH", "CELLS"];
      const parsed = await CSVParser.parseFile(fileInput.files[0], required);
      const rowsMatrix = parsed.data.map(obj => [
        obj["MATERIAL_ID"], obj.RECORD_DATE || "", obj.DIS || "", obj.PCN_ID, obj.RACK || "", obj.LOC || "",
        obj.WIDTH, obj.CELLS, obj.FCT || 0, obj.COST || 0, obj.STATUS || "NO AUDITADO"
      ]);

      const pContainer = document.getElementById("progress-inv-container");
      const pBar = document.getElementById("progress-inv-bar");
      const pText = document.getElementById("progress-inv-text");
      pContainer.classList.remove("hidden");

      await GasAPI.uploadInChunks("uploadInventoryChunk", rowsMatrix, (percent, chunk, total) => {
        pBar.style.width = percent + "%";
        pText.innerText = `${percent}% (Lote ${chunk} de ${total})`;
      });

      App.showToast("Carga masiva de inventario completada.", "success");
      await App.refreshDatabase();
      renderAssignedMaterials();
    } catch (err) {
      App.showToast(err.message, "error");
    }
  }

  async function uploadAudit() {
    const fileInput = document.getElementById("file-audit-csv");
    if (!fileInput.files.length) return App.showToast("Selecciona un archivo CSV de auditoría.", "error");

    try {
      const required = ["MATERIAL_ID", "PCN_ID", "WIDTH", "CELLS"];
      const parsed = await CSVParser.parseFile(fileInput.files[0], required);
      const rowsMatrix = parsed.data.map(obj => [
        obj["MATERIAL_ID"], obj.RECORD_DATE || "", obj.DIS || "", obj.PCN_ID, obj.RACK || "", obj.LOC || "",
        obj.WIDTH, obj.CELLS, obj.FCT || 0, obj.COST || 0
      ]);

      const pContainer = document.getElementById("progress-aud-container");
      const pBar = document.getElementById("progress-aud-bar");
      const pText = document.getElementById("progress-aud-text");
      pContainer.classList.remove("hidden");

      await GasAPI.uploadInChunks("uploadAuditChunk", rowsMatrix, (percent, chunk, total) => {
        pBar.style.width = percent + "%";
        pText.innerText = `${percent}% (Lote ${chunk} de ${total})`;
      });

      App.showToast("Carga de auditoría finalizada y cruce ejecutado.", "success");
      await App.refreshDatabase();
      renderAssignedMaterials();
    } catch (err) {
      App.showToast(err.message, "error");
    }
  }

  function renderAssignedMaterials() {
    const container = document.getElementById("assigned-materials-table");
    const assignments = App.getDbTable("tbAsignaciones");

    if (!assignments || assignments.length === 0) {
      container.innerHTML = `<p style="color: #64748b;">No hay asignaciones registradas.</p>`;
      return;
    }

    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; text-align: left;">
          <th style="padding: 8px;">MATERIAL ID</th>
          <th style="padding: 8px;">FECHA ORDEN</th>
          <th style="padding: 8px;">PCN_ID</th>
          <th style="padding: 8px;">UBICACIÓN</th>
          <th style="padding: 8px;">DIMENSIONES</th>
          <th style="padding: 8px;">ESTATUS</th>
        </tr>
      </thead>
      <tbody>`;

    assignments.slice(-15).reverse().forEach(row => {
      html += `<tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; font-weight: bold;">${row["MATERIAL_ID"]}</td>
        <td style="padding: 8px;">${row.ORDER_DATE || row.RECORD_DATE}</td>
        <td style="padding: 8px;">${row.PCN_ID}</td>
        <td style="padding: 8px;">${row.RACK || ''} - ${row.LOC || ''}</td>
        <td style="padding: 8px;">${row.WIDTH} W x ${row.CELLS} C</td>
        <td style="padding: 8px;"><span class="badge" style="background: #e2e8f0;">${row.STATUS}</span></td>
      </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  return {
    render: render,
    uploadInventory: uploadInventory,
    uploadAudit: uploadAudit
  };
})();