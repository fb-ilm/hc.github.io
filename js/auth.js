/**
 * Frontend - Actualización de js/auth.js para verificación de PIN en 2 pasos
 */

/**
 * Frontend - js/auth.js (Asegurar exposición de verifyAndSavePin)
 */

const AuthService = (function() {
  let tempInitialPin = "";
  let pendingEmail = "";

  async function hashPin(pinText) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pinText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function initPinInputEvents() {
    setupBoxListeners('.pin-box');
    setupBoxListeners('.pin-confirm-box');
  }

  function setupBoxListeners(selector) {
    const boxes = document.querySelectorAll(selector);
    boxes.forEach((box, index) => {
      box.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          boxes[index - 1].focus();
        }
      });
    });
  }

  function getEnteredPin(selector = '.pin-box') {
    let pin = "";
    document.querySelectorAll(selector).forEach(b => pin += b.value);
    return pin;
  }

  function clearPinBoxes(selector = '.pin-box') {
    document.querySelectorAll(selector).forEach(b => b.value = "");
  }

  function promptPinSetupModal(email, initialPin) {
    pendingEmail = email;
    tempInitialPin = initialPin;
    clearPinBoxes('.pin-confirm-box');
    
    const errorBox = document.getElementById("pin-modal-error");
    if (errorBox) errorBox.classList.add("hidden");
    
    document.getElementById("pin-confirm-modal").classList.remove("hidden");
    
    setTimeout(() => {
      const firstBox = document.querySelector('.pin-confirm-box[data-index="0"]');
      if (firstBox) firstBox.focus();
    }, 150);
  }

  async function verifyAndSavePin() {
    const confirmPin = getEnteredPin('.pin-confirm-box');
    const errorBox = document.getElementById("pin-modal-error");

    if (confirmPin.length !== 6) {
      if (errorBox) {
        errorBox.innerText = "Ingresa los 6 dígitos para confirmar.";
        errorBox.classList.remove("hidden");
      }
      return;
    }

    if (confirmPin !== tempInitialPin) {
      if (errorBox) {
        errorBox.innerText = "El PIN ingresado no coincide con el primero. Inténtalo de nuevo.";
        errorBox.classList.remove("hidden");
      }
      clearPinBoxes('.pin-confirm-box');
      const firstBox = document.querySelector('.pin-confirm-box[data-index="0"]');
      if (firstBox) firstBox.focus();
      return;
    }

    // Coinciden los 6 dígitos -> Ocultar modal y disparar petición al backend
    document.getElementById("pin-confirm-modal").classList.add("hidden");
    if (window.App && App.showLoader) App.showLoader("Guardando nuevo PIN e iniciando sesión...");

    const pinHash = await hashPin(confirmPin);

    // Enviar petición explícita setupPin
    const res = await GasAPI.send("setupPin", { 
      email: pendingEmail, 
      pinHash: pinHash 
    });

    if (res && res.success) {
      tempInitialPin = "";
      saveSession(res.user, res.token);
      await App.showAppLayout(res.user);
    } else {
      if (window.App && App.hideLoader) App.hideLoader();
      alert((res && res.message) ? res.message : "Error al registrar el PIN.");
      clearPinBoxes('.pin-box');
    }
  }

  function cancelPinSetup() {
    document.getElementById("pin-confirm-modal").classList.add("hidden");
    clearPinBoxes('.pin-box');
    tempInitialPin = "";
    pendingEmail = "";
  }

  function saveSession(userData, token) {
    const sessionObj = {
      user: userData,
      token: token,
      lastActivityTimestamp: Date.now()
    };
    localStorage.setItem('opti_session', JSON.stringify(sessionObj));
  }

  function getSession() {
    const raw = localStorage.getItem('opti_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() - session.lastActivityTimestamp > CONFIG.SESSION_TIMEOUT_MS) {
      clearSession();
      return null;
    }
    session.lastActivityTimestamp = Date.now();
    localStorage.setItem('opti_session', JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem('opti_session');
  }

  // EXPOSICIÓN PÚBLICA ESTRICTA
  return {
    initPinEvents: initPinInputEvents,
    getPin: getEnteredPin,
    clearPin: clearPinBoxes,
    hashPin: hashPin,
    promptPinSetupModal: promptPinSetupModal,
    verifyAndSavePin: verifyAndSavePin,
    cancelPinSetup: cancelPinSetup,
    saveSession: saveSession,
    getSession: getSession,
    clearSession: clearSession
  };
})();