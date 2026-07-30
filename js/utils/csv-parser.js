/**
 * Frontend - Parser e Interprete de Archivos CSV
 * Archivo: js/utils/csv-parser.js
 */

const CSVParser = (function() {

  // Mapeo flexible de alias para cabeceras esperadas
  const HEADER_ALIASES = {
    "MATERIAL ID": ["MATERIAL ID", "MATERIAL_ID", "ID_MATERIAL", "MATERIAL"],
    "RECORD_DATE": ["RECORD_DATE", "RECORD DATE", "FECHA_REGISTRO", "FECHA REGISTRO"],
    "ORDER_DATE": ["ORDER_DATE", "ORDER DATE", "FECHA_ORDEN", "FECHA ORDEN"],
    "ORDER_ID": ["ORDER_ID", "ORDER ID", "ID_ORDEN", "ORDEN_ID", "ORDEN", "ORDER"],
    "DIS": ["DIS", "DISTANCIA"],
    "PCN_ID": ["PCN_ID", "PCN ID", "PCN"],
    "RACK": ["RACK", "UBICACION_RACK"],
    "LOC": ["LOC", "LOCALIZACION", "UBICACION"],
    "WIDTH": ["WIDTH", "ANCHO"],
    "CELLS": ["CELLS", "CELDA", "CELDAS"],
    "FCT": ["FCT", "FACTOR"],
    "COST": ["COST", "COSTO"]
  };

  /**
   * Lee un File como texto y lo convierte a matriz de cadenas
   */
  function parseCSVText(text) {
    const lines = text.split(/\r\n|\n/);
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Autodetectar delimitador (Coma o Punto y Coma)
      const delimiter = line.includes(';') ? ';' : ',';
      
      // Regex para parsear valores respetando comillas
      const pattern = new RegExp(
        `(?:^|${delimiter})(?:"([^"]*)"|([^"${delimiter}]*))`,
        "g"
      );

      const row = [];
      let match;
      while ((match = pattern.exec(line))) {
        let val = match[1] !== undefined ? match[1] : match[2];
        row.push(val ? val.trim() : "");
      }

      if (row.length > 0) {
        result.push(row);
      }
    }
    return result;
  }

  /**
   * Mapea de forma inteligente las cabeceras detectadas a la estructura estándar
   */
  function mapHeaders(rawHeaders) {
    const headerMap = {};

    rawHeaders.forEach((rawH, index) => {
      const normalizedH = rawH.toUpperCase().trim();
      
      for (const [standardKey, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(normalizedH)) {
          headerMap[standardKey] = index;
          break;
        }
      }
    });

    return headerMap;
  }

  /**
   * Procesa un archivo CSV masivo
   * @param {File} file Archivo CSV cargado por el usuario
   * @param {Array<string>} requiredHeaders Lista de cabeceras obligatorias
   */
  function parseFile(file, requiredHeaders = []) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function(e) {
        try {
          const matrix = parseCSVText(e.target.result);
          if (matrix.length < 2) {
            return reject(new Error("El archivo CSV está vacío o no contiene datos válidos."));
          }

          const rawHeaders = matrix[0];
          const headerMap = mapHeaders(rawHeaders);

          // Verificar si están todas las cabeceras requeridas
          const missing = requiredHeaders.filter(req => headerMap[req] === undefined);
          if (missing.length > 0) {
            return reject(new Error(`Faltan cabeceras obligatorias en el CSV: ${missing.join(", ")}`));
          }

          // Convertir filas a objetos mapeados según orden estándar
          const dataRows = [];
          for (let i = 1; i < matrix.length; i++) {
            const row = matrix[i];
            const mappedRow = {};

            for (const [key, idx] of Object.entries(headerMap)) {
              mappedRow[key] = row[idx] !== undefined ? row[idx] : "";
            }

            dataRows.push(mappedRow);
          }

          resolve({
            headers: Object.keys(headerMap),
            data: dataRows
          });

        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("Error de lectura del archivo CSV."));
      reader.readAsText(file);
    });
  }

  return {
    parseFile: parseFile
  };
})();