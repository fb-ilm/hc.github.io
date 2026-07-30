/**
 * Frontend - Cliente API para Google Apps Script
 * Archivo: js/gas-api.js
 */

const GasAPI = (function() {

  async function sendRequest(action, payload = {}) {
    const session = AuthService.getSession();
    const bodyData = {
      action: action,
      payload: payload,
      token: session ? session.token : null,
      userEmail: session ? session.user.email : null
    };

    try {
      const response = await fetch(CONFIG.GAS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8" // Evita disparar preflight OPTIONS en GAS
        },
        body: JSON.stringify(bodyData)
      });

      const result = await response.json();

      if (result.sessionExpired) {
        AuthService.clearSession();
        alert("Su sesión ha expirado por inactividad. Inicie sesión nuevamente.");
        window.location.reload();
        return { success: false, message: "Sesión expirada" };
      }

      return result;
    } catch (err) {
      console.error("Error de comunicación con el backend GAS:", err);
      return { success: false, message: "Error de red o conexión con el servidor." };
    }
  }

  // Procesamiento y envío de archivos masivos divididos en Chunks
  async function uploadInChunks(actionType, rowsArray, progressCallback) {
    const totalRows = rowsArray.length;
    const chunkSize = CONFIG.CHUNK_SIZE;
    const totalChunks = Math.ceil(totalRows / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalRows);
      const chunkRows = rowsArray.slice(start, end);

      const isFirstChunk = (i === 0);
      const isLastChunk = (i === totalChunks - 1);

      const payload = {
        rows: chunkRows,
        isFirstChunk: isFirstChunk,
        isLastChunk: isLastChunk,
        chunkIndex: i + 1,
        totalChunks: totalChunks
      };

      const res = await sendRequest(actionType, payload);

      if (!res.success) {
        throw new Error(`Error procesando lote ${i + 1} de ${totalChunks}: ${res.message}`);
      }

      // Notificar avance del porcentaje procesado
      if (typeof progressCallback === "function") {
        const percent = Math.round(((i + 1) / totalChunks) * 100);
        progressCallback(percent, i + 1, totalChunks);
      }
    }

    return { success: true };
  }

  return {
    send: sendRequest,
    uploadInChunks: uploadInChunks
  };
})();