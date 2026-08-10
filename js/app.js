/**
 * Frontend - Orquestador Principal de la Aplicación
 * Archivo: js/app.js
 */

const App = (function() {
  let dbState = {};
  let currentActiveRole = "Validador";
  let barcodeBuffer = "";
  let lastKeyTime = Date.now();

  function init() {
    AuthService.initPinEvents();
    setupGlobalEventListeners();
    checkSessionState();
  }

  // Detección inteligente de Lector de Código de Barras / QR por velocidad de tipeo
  function setupGlobalEventListeners() {
    document.addEventListener("keydown", (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Un lector de código de barras transmite caracteres consecutivamente en intervalos menor a 30ms
      if (timeDiff < 30) {
        if (e.key === "Enter") {
          if (barcodeBuffer.length > 2) {
            handleBarcodeScan(barcodeBuffer);
          }
          barcodeBuffer = "";
        } else if (e.key.length === 1) {
          barcodeBuffer += e.key;
        }
      } else {
        // Tipeo manual regular
        if (timeDiff > 200) {
          barcodeBuffer = e.key.length === 1 ? e.key : "";
        }
      }
    });

    const btnSavePin = document.getElementById("btn-save-pin");

    if (btnSavePin) {
    btnSavePin.addEventListener("click", () => {
        AuthService.verifyAndSavePin();
    });
    }

    // Formulario de inicio de sesión
    document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);

    // Navegación por pestañas
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        switchView(e.target.dataset.view);
      });
    });

    // Switcher de roles (Solo visible para Admin)
    document.getElementById("admin-role-select").addEventListener("change", (e) => {
      currentActiveRole = e.target.value;
      updateUIForRole(currentActiveRole);
    });

    // Logout
    document.getElementById("btn-logout").addEventListener("click", () => {
      AuthService.clearSession();
      window.location.reload();
    });
  }

    /**
     * Renderiza la foto del usuario autenticado en la barra superior.
     * @param {string} userEmail - Email del usuario activo.
     */
    function updateUserAvatar(userEmail) {
    const users = App.getDbTable("tbUsuarios") || [];
    const currentUser = users.find(
        (u) => String(u.EMAIL || u.email).toLowerCase() === String(userEmail).toLowerCase()
    );

    const imgEl = document.getElementById("user-avatar-img");
    const iconEl = document.getElementById("logo-icon");

    if (currentUser && currentUser.PICTURE && currentUser.PICTURE.trim() !== "") {
        imgEl.src = currentUser.PICTURE.trim();
        imgEl.style.display = "block";
        iconEl.style.display = "none";
    } else {
        // Si no hay foto en tbUsuarios, se muestra el icono predeterminado
        imgEl.style.display = "none";
        iconEl.style.display = "block";
    }
    }

  function handleBarcodeScan(scannedCode) {
    showToast(`Escáner detectado: ${scannedCode}`, "info");

    // Enfocar y rellenar automáticamente el campo de escaneo si está presente en la vista activa
    const pcnInput = document.getElementById("val-pcn") || document.getElementById("re-order-id");
    if (pcnInput) {
      pcnInput.value = scannedCode;
      pcnInput.focus();
    }
  }

  async function handleLoginSubmit() {
    const email = document.getElementById("login-email").value.trim();
    const pin = AuthService.getPin();
    const alertBox = document.getElementById("login-alert");

    alertBox.classList.add("hidden");

    if (!email || pin.length !== 6) {
      alertBox.innerText = "Por favor, ingresa tu correo y los 6 dígitos del PIN.";
      alertBox.classList.remove("hidden");
      return;
    }

    const pinHash = await AuthService.hashPin(pin);
    const noticeVisible = !document.getElementById("pin-setup-notice").classList.contains("hidden");

    const actionType = noticeVisible ? "setupPin" : "login";
    showToast("Verificando credenciales...", "info");

    const res = await GasAPI.send(actionType, { email: email, pinHash: pinHash });

    if (res.success) {
      AuthService.saveSession(res.user, res.token);
      showAppLayout(res.user);
    } else {
      if (res.needsPinSetup) {
        document.getElementById("pin-setup-notice").classList.remove("hidden");
        alertBox.innerText = res.message;
        alertBox.classList.remove("hidden");
      } else {
        alertBox.innerText = res.message || "Error al iniciar sesión.";
        alertBox.classList.remove("hidden");
      }
    }
  }

  function checkSessionState() {
    const session = AuthService.getSession();
    if (session) {
      showAppLayout(session.user);
    } else {
      document.getElementById("login-screen").classList.remove("hidden");
      document.getElementById("app-container").classList.add("hidden");
    }
  }

  function showLoader(text = "Cargando...") {
    document.getElementById("loading-text").innerText = text;
    document.getElementById("loading-overlay").classList.remove("hidden");
  }

  function hideLoader() {
    document.getElementById("loading-overlay").classList.add("hidden");
  }

  async function handleLoginSubmit() {
    const email = document.getElementById("login-email").value.trim();
    const pin = AuthService.getPin('.pin-box');
    const alertBox = document.getElementById("login-alert");

    alertBox.classList.add("hidden");

    if (!email || pin.length !== 6) {
      alertBox.innerText = "Por favor, ingresa tu correo y los 6 dígitos del PIN.";
      alertBox.classList.remove("hidden");
      return;
    }

    showLoader("Verificando acceso...");
    const pinHash = await AuthService.hashPin(pin);
    const res = await GasAPI.send("login", { email: email, pinHash: pinHash });
    hideLoader();

    if (res.success) {
      AuthService.saveSession(res.user, res.token);
      await showAppLayout(res.user);
    } else {
    if (res.needsPinSetup) {
      // Activar Modal de confirmación en 2 pasos
      AuthService.promptPinSetupModal(email, pin);
    } else {
      alertBox.innerText = res.message || "Error al iniciar sesión.";
      alertBox.classList.remove("hidden");
    }
  }
}

async function showAppLayout(user) {
  showLoader("Cargando módulos y datos...");

  // 1. Ocultar pantalla de login
  document.getElementById("login-screen").classList.add("hidden");

  // 2. Ocultar todas las pestañas mientras se obtienen datos para evitar fugas visuales
  document.querySelectorAll(".nav-tab").forEach(t => t.style.display = "none");
  document.querySelectorAll(".view-panel").forEach(p => p.classList.add("hidden"));

  document.getElementById("user-display-name").innerText = `${user.name || user.email}`;
  currentActiveRole = user.role;

  if (user.role === "Admin") {
    document.getElementById("admin-role-switcher").classList.remove("hidden");
  } else {
    document.getElementById("admin-role-switcher").classList.add("hidden");
  }

  // 3. Obtener datos limpios
  await refreshDatabase();

  updateUserAvatar(user.email);

  // 4. Mostrar la app y actualizar la UI correspondiente al rol
  document.getElementById("app-container").classList.remove("hidden");
  updateUIForRole(currentActiveRole);

  hideLoader();
}

function logout() {
  AuthService.clearSession();
  dbState = {};
  
  // Limpiar vista antes de recargar
  document.querySelectorAll(".view-panel").forEach(p => p.innerHTML = "");
  document.getElementById("app-container").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  
  window.location.reload();
} updateUIForRole(currentActiveRole);

  async function refreshDatabase() {
    const res = await GasAPI.send("getInitialData", { role: currentActiveRole });
    if (res.success) {
      dbState = res.data;
    }
  }

  function updateUIForRole(role) {
    const badgeEl = document.getElementById("role-badge");
    if (badgeEl) badgeEl.innerText = role;

    const tabVal = document.getElementById("tab-validator");
    const tabSup = document.getElementById("tab-supervisor");
    const tabOpt = document.getElementById("tab-optimizer");
    const tabCut = document.getElementById("tab-cutter");
    const tabPick = document.getElementById("tab-picker");
    const tabAdm = document.getElementById("tab-admin");

    // 1. Reglas de visibilidad de Tabs basadas en roles
    if (tabVal) tabVal.style.display = (role === "Validador" || role === "Manager" || role === "Admin") ? "block" : "none";
    if (tabSup) tabSup.style.display = (role === "Supervisor" || role === "Manager" || role === "Admin") ? "block" : "none";
    if (tabOpt) tabOpt.style.display = (role === "Optimizador" || role === "Manager" || role === "Admin") ? "block" : "none";
    
    // Visibilidad restringida para Cutter y Picker (solo Admin/Manager o su rol correspondiente)
    if (tabCut) tabCut.style.display = (role === "Cutter" || role === "Validador" || role === "Manager" || role === "Admin") ? "block" : "none";
    if (tabPick) tabPick.style.display = (role === "Picker" || role === "Validador" || role === "Manager" || role === "Admin") ? "block" : "none";
    
    if (tabAdm) tabAdm.style.display = (role === "Admin") ? "block" : "none";

    // 2. Seleccionar la vista inicial según el rol
    if (role === "Picker") switchView("picker-view");
    else if (role === "Cutter") switchView("cutter-view");
    else if (role === "Validador" || role === "Manager") switchView("validator-view");
    else if (role === "Supervisor") switchView("supervisor-view");
    else if (role === "Optimizador") switchView("optimizer-view");
    else if (role === "Admin") switchView("admin-view");
  }

  function switchView(viewId) {
    document.querySelectorAll(".view-panel").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));

    const targetPanel = document.getElementById(viewId);
    if (targetPanel) {
      targetPanel.classList.remove("hidden");

      if (viewId === "validator-view") ValidatorView.render(targetPanel);
      else if (viewId === "supervisor-view") SupervisorView.render(targetPanel);
      else if (viewId === "optimizer-view") OptimizerView.render(targetPanel);
      else if (viewId === "cutter-view") CutterView.render(targetPanel);
      else if (viewId === "picker-view" && typeof MobilePickerView !== "undefined") MobilePickerView.render(targetPanel);
      else if (viewId === "admin-view") AdminView.render(targetPanel);
    }

    const activeTab = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
    if (activeTab) activeTab.classList.add("active");
  }

  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerText = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function getDbTable(tableName) {
    return dbState[tableName] || [];
  }

  return {
    init: init,
    showToast: showToast,
    updateUserAvatar: updateUserAvatar,
    showLoader: showLoader,
    hideLoader: hideLoader,
    refreshDatabase: refreshDatabase,
    getDbTable: getDbTable
  };
})();

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
