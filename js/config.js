/**
 * Frontend - Configuración Global
 * Archivo: js/config.js
 */

const CONFIG = {
  // Reemplaza esta URL con la URL de tu Web App desplegada en Google Apps Script
  GAS_ENDPOINT: "https://script.google.com/macros/s/AKfycbwaFF7MKb9QNIgW0WpzEhukeqPhEKPmDxeBK5dg-8RTZrSjXy8wNnK83yhcSPTCORGPuA/exec",
  
  // Tiempos de sesión e inactividad (1 Hora = 3,600,000 ms)
  SESSION_TIMEOUT_MS: 60 * 60 * 1000,
  
  // Tamaño de lote/chunk para cargas masivas (3,000 filas por petición)
  CHUNK_SIZE: 3000,

  // Tolerancia dimensional mínima para asignación (en unidades)
  MARGINS: {
    WIDTH: 2,
    CELLS: 5
  },

  // Formato de fecha esperado/generado
  DATE_FORMAT: "MM/DD/YYYY HH:mm:ss"
};