/**
 * Frontend - Vista para Rol Admin
 * Archivo: js/views/admin.js
 */

const AdminView = (function() {
  let selectedTable = "tbUsuarios";

  function render(container) {
    container.innerHTML = `
      <div class="view-header" style="margin-bottom: 20px;">
        <h2>Panel de Administración de Base de Datos y Roles</h2>
        <p class="text-muted">Gestión directa de usuarios, tablas y auditoría general.</p>
      </div>

      <!-- SECTOR DE ADMINISTRACIÓN DE USUARIOS -->
      <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
        <h3>Gestión de Usuarios</h3>
        <hr style="margin: 12px 0;">

        <form id="form-manage-user" onsubmit="return false;" style="display: grid; grid-template-columns: 2fr 2fr 1fr 1fr; gap: 12px; align-items: end;">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Correo Electrónico</label>
            <input type="email" id="admin-user-email" class="form-control" placeholder="operador@empresa.com" required>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>Nombre Completo</label>
            <input type="text" id="admin-user-name" class="form-control" placeholder="Juan Pérez">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>Rol Asignado</label>
            <select id="admin-user-role" class="form-control" style="width: 100%; padding: 8px;">
              <option value="Validador">Validador</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Optimizador">Optimizador</option>
              <option value="Manager">Manager</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="AdminView.createUser()">+ Registrar Usuario</button>
        </form>
      </div>

      <!-- EXPLORADOR CRUD DE TABLAS -->
      <div class="card" style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>Explorador e Inspección de Tablas</h3>
          <div style="display: flex; gap: 8px; align-items: center;">
            <label>Seleccionar Tabla:</label>
            <select id="admin-table-select" class="form-control" onchange="AdminView.onTableChange(this.value)">
              <option value="tbUsuarios">tbUsuarios</option>
              <option value="tbInventario">tbInventario</option>
              <option value="tbAuditoria">tbAuditoria</option>
              <option value="tbAsignaciones">tbAsignaciones</option>
              <option value="tbStandby">tbStandby</option>
              <option value="tbLogs">tbLogs</option>
            </select>
          </div>
        </div>
        <hr style="margin-bottom: 16px;">

        <div id="admin-table-view-container">Cargando datos...</div>
      </div>
    `;

    renderTableData(selectedTable);
  }

  function onTableChange(tableName) {
    selectedTable = tableName;
    renderTableData(selectedTable);
  }

  async function createUser() {
    const email = document.getElementById("admin-user-email").value.trim();
    const name = document.getElementById("admin-user-name").value.trim();
    const role = document.getElementById("admin-user-role").value;

    if (!email) return App.showToast("El correo es obligatorio.", "error");

    App.showToast("Registrando usuario...", "info");
    const res = await GasAPI.send("adminManageUser", {
      subAction: "CREATE",
      targetEmail: email,
      name: name,
      role: role
    });

    if (res.success) {
      App.showToast("Usuario registrado exitosamente.", "success");
      document.getElementById("admin-user-email").value = "";
      document.getElementById("admin-user-name").value = "";
      await App.refreshDatabase();
      renderTableData(selectedTable);
    } else {
      App.showToast("Error creando usuario: " + res.message, "error");
    }
  }

  function renderTableData(tableName) {
    const container = document.getElementById("admin-table-view-container");
    const rows = App.getDbTable(tableName);

    if (!rows || rows.length === 0) {
      container.innerHTML = `<p style="color: #64748b;">La tabla '${tableName}' se encuentra vacía.</p>`;
      return;
    }

    const headers = Object.keys(rows[0]);
    let html = `<div style="overflow-x: auto; max-height: 400px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
        <thead>
          <tr style="background: #0f172a; color: #fff; text-align: left;">
            ${headers.map(h => `<th style="padding: 8px;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>`;

    rows.forEach(r => {
      html += `<tr style="border-bottom: 1px solid #e2e8f0;">
        ${headers.map(h => `<td style="padding: 8px;">${r[h] !== undefined ? r[h] : ''}</td>`).join('')}
      </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  return {
    render: render,
    onTableChange: onTableChange,
    createUser: createUser
  };
})();