const SPREADSHEET_ID = '1X1uJk5pOCl24-qDNhjjC4CeOaJskQaipM5MVyXkq0Yk';
const DRIVE_FOLDER_ID = '1j7GO03N7lul2_cVjm4HbKzOQovn53gDc';

function doOptions(e) {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Maneja peticiones GET — compatible con localhost y file:// sin problemas de CORS
function doGet(e) {
  try {
    const data = e.parameter;
    const action = data.action;
    let result = { success: false, message: "Acción no reconocida" };

    if (action === 'proxyImage') {
      try {
        let fileId = "";
        const match = data.url.match(/id=([^&]+)/);
        if (match) fileId = match[1];
        else {
            const match2 = data.url.match(/\/d\/([^\/]+)/);
            if (match2) fileId = match2[1];
        }
        
        if (fileId) {
            const file = DriveApp.getFileById(fileId);
            const blob = file.getBlob();
            const base64 = "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
            return ContentService.createTextOutput(base64).setMimeType(ContentService.MimeType.TEXT);
        } else {
            return ContentService.createTextOutput("Error: Invalid URL").setMimeType(ContentService.MimeType.TEXT);
        }
      } catch (e) {
          return ContentService.createTextOutput("Error: " + e.message).setMimeType(ContentService.MimeType.TEXT);
      }
    }

    if (action === 'requestToken') {
      result = requestToken(data.documento);
    } else if (action === 'verifyToken') {
      result = verifyToken(data.documento, data.token);
    } else if (action === 'getEvents') {
      result = getEvents(data.userId);
    } else if (action === 'logActivity') {
      result = logActivity(data.documento, data.userObj, data.activity);
    } else if (action === 'getUsers') {
      result = getUsers();
    } else if (action === 'saveValoracion') {
      result = saveValoracion(data.documento, data.nombre, data.cargo, data.calificacion, data.comentarios);
    } else if (action === 'logInteraction') {
      result = logInteraction(data.documento, data.nombre, data.tipo, data.fileName, data.fileId);
    } else if (action === 'getUserStats') {
      result = getUserStats(data.documento);
    } else if (action === 'getAdminDashboard') {
      result = getAdminDashboard();
    }

    const output = ContentService.createTextOutput(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  } catch(error) {
    const output = ContentService.createTextOutput(JSON.stringify({success: false, message: error.toString()}));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

function doPost(e) {
  try {
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter;
    }
    
    const action = data.action;
    let result = { success: false, message: "Acción no reconocida" };
    
    if (action === 'requestToken') {
      result = requestToken(data.documento);
    } else if (action === 'verifyToken') {
      result = verifyToken(data.documento, data.token);
    } else if (action === 'getEvents') {
      result = getEvents(data.userId); // Cambiado a userId
    } else if (action === 'logActivity') {
      result = logActivity(data.documento, data.userObj, data.activity);
    } else if (action === 'getUsers') {
      result = getUsers();
    } else if (action === 'saveValoracion') {
      result = saveValoracion(data.documento, data.nombre, data.cargo, data.calificacion, data.comentarios);
    } else if (action === 'logInteraction') {
      result = logInteraction(data.documento, data.nombre, data.tipo, data.fileName, data.fileId);
    } else if (action === 'getUserStats') {
      result = getUserStats(data.documento);
    } else if (action === 'getAdminDashboard') {
      result = getAdminDashboard();
    }
    
    let output = ContentService.createTextOutput(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  } catch(error) {
    let output = ContentService.createTextOutput(JSON.stringify({success: false, message: error.toString()}));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

function requestToken(documento) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  
  let userFound = null;
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString() === documento.toString() || data[i][0].toString() === documento.toString()) {
      userFound = {
        id: data[i][0],
        documento: data[i][1],
        nombre: data[i][2],
        apellido: "",
        cargo: data[i][3],
        email: data[i][4],
        estado: data[i][5],
        token: data[i][6],
        foto: data[i][7],
        confirmado: (data[i][8] instanceof Date) ? Utilities.formatDate(data[i][8], "America/Bogota", "yyyy-MM-dd HH:mm:ss") : data[i][8], // Columna I
        rol: data[i][9]
      };
      rowIndex = i + 1;
      break;
    }
  }
  
  if (!userFound) return { success: false, message: "Documento no encontrado" };
  if (userFound.estado && userFound.estado.toString().toLowerCase() !== "activo") {
      return { success: false, message: "Usuario inactivo" };
  }

  // Si ya está confirmado, no pedir token de nuevo
  if (userFound.confirmado && userFound.confirmado.toString().trim() !== "") {
      logActivity(documento, JSON.stringify(userFound), "Ingreso directo (Usuario ya confirmado)");
      return { success: true, skipToken: true, userData: userFound };
  }

  if (!userFound.email) return { success: false, message: "El usuario no tiene correo registrado" };
  
  let tokenToSend = userFound.token;
  
  if (!tokenToSend || tokenToSend.toString().trim() === "") {
    tokenToSend = generarTokenUnico(sheet);
    sheet.getRange(rowIndex, 7).setValue(tokenToSend);
  }
  
  const body = "Hola " + userFound.nombre + ",\n\nTu token de acceso a Nuestros Momentos BaseTek es: " + tokenToSend + "\n\nEste token es personal e intransferible.";
  MailApp.sendEmail(userFound.email, "Tu Token de Acceso - BaseTek", body);
  logActivity(documento, JSON.stringify(userFound), "Solicitud de token enviada");
  
  return { success: true, message: "Token enviado", emailHint: userFound.email.substring(0,3) + "...@" + userFound.email.split("@")[1] };
}

function verifyToken(documento, tokenIngresado) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  let userFound = null;
  let rowIndex = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString() === documento.toString() || data[i][0].toString() === documento.toString()) {
      userFound = {
        id: data[i][0],
        documento: data[i][1],
        nombre: data[i][2],
        apellido: "",
        cargo: data[i][3],
        email: data[i][4],
        estado: data[i][5],
        token: data[i][6],
        foto: data[i][7],
        confirmado: (data[i][8] instanceof Date) ? Utilities.formatDate(data[i][8], "America/Bogota", "yyyy-MM-dd HH:mm:ss") : data[i][8],
        rol: data[i][9]
      };
      rowIndex = i + 1;
      break;
    }
  }
  
  if (!userFound) return { success: false, message: "Usuario no encontrado" };
  if (userFound.token.toString() !== tokenIngresado.toString()) return { success: false, message: "Token incorrecto" };
  
  // Marcar como confirmado con fecha y hora
  const fechaHora = Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd HH:mm:ss");
  sheet.getRange(rowIndex, 9).setValue(fechaHora); // Columna I (Confirmado)
  userFound.confirmado = fechaHora;

  enviarCorreoHTML(userFound.email, userFound.nombre);
  logActivity(documento, JSON.stringify(userFound), "Ingreso exitoso y aceptación de términos");
  
  return { success: true, userData: userFound };
}

function enviarCorreoHTML(email, nombre) {
    const htmlBody = `
    <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: auto; border: none; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #001f45 0%, #01326c 100%); padding: 40px 20px; text-align: center;">
            <img src="https://i.imgur.com/lM8m54y.png" alt="BaseTek" style="max-height: 60px; margin-bottom: 15px; display: none;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 0.5px;">📸 Nuestros Momentos</h1>
            <p style="color: #43bff5; margin-top: 8px; font-size: 16px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">BaseTek</p>
        </div>
        <div style="padding: 40px; color: #444444;">
            <p style="font-size: 18px; color: #01326c; font-weight: 600;">¡Hola ${nombre}!</p>
            <p style="font-size: 15px; line-height: 1.7;">Nos emociona tenerte en este espacio creado especialmente para revivir y compartir los mejores momentos de nuestras actividades. Al acceder, confirmas tu compromiso con nuestras pautas de convivencia:</p>
            
            <div style="background-color: #f8fbff; border-left: 4px solid #43bff5; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;"><strong>1. Uso interno:</strong> Material exclusivo para recuerdo personal. Prohibido su uso comercial.</p>
                <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;"><strong>2. Privacidad:</strong> Puedes descargar libremente. Si publicas, asegúrate de contar con el consentimiento de tus compañeros.</p>
                <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;"><strong>3. Datos Personales:</strong> Tratadas bajo la Política de Datos de BaseTek (Ley 1581 de 2012).</p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6;"><strong>4. Habeas Data:</strong> Puedes solicitar el retiro de tu imagen al área de Talento Humano.</p>
            </div>
            
            <div style="text-align: center; margin-top: 40px;">
                <p style="font-size: 16px; color: #2279b1; font-weight: 500;">¡Disfruta reviviendo nuestros mejores momentos!</p>
            </div>
        </div>
        <div style="background-color: #f4f7f9; padding: 20px; text-align: center; font-size: 12px; color: #888888;">
            &copy; ${new Date().getFullYear()} BaseTek. Todos los derechos reservados.
        </div>
    </div>
    `;
    
    MailApp.sendEmail({
        to: email,
        subject: "Tus Compromisos - Nuestros Momentos BaseTek",
        htmlBody: htmlBody
    });
}

function getEvents(userId) {
  const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const folders = parentFolder.getFolders();
  let frames = {};
  
  // Leer orden de eventos de la hoja "Eventos"
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const eventosSheet = ss.getSheetByName("Eventos");
  let eventOrder = {};
  // Normaliza nombres: minúsculas, sin tildes, espacios simples
  const normName = (s) => s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  if (eventosSheet) {
    const evData = eventosSheet.getDataRange().getValues();
    for (let i = 1; i < evData.length; i++) {
      if (evData[i][1]) {
        eventOrder[normName(evData[i][1])] = {
            order: parseInt(evData[i][0]) || 999,
            logo: evData[i][2] ? evData[i][2].toString().trim() : null
        };
      }
    }
  }
  // Busca el evento: primero coincidencia exacta normalizada; si no, por palabras contenidas
  // (ej: carpeta "Carrera de la Mujer 2026" ↔ hoja "Carrera de la Mujer Bogotá 2026")
  const findEventInfo = (folderName) => {
    const key = normName(folderName);
    if (eventOrder[key]) return eventOrder[key];
    const fWords = key.split(' ');
    let best = null, bestScore = 0;
    for (const sheetName in eventOrder) {
      const sWords = sheetName.split(' ');
      const folderInSheet = fWords.every(w => sWords.includes(w));
      const sheetInFolder = sWords.every(w => fWords.includes(w));
      if (folderInSheet || sheetInFolder) {
        const score = Math.min(fWords.length, sWords.length) / Math.max(fWords.length, sWords.length);
        if (score > bestScore) { bestScore = score; best = eventOrder[sheetName]; }
      }
    }
    return best || { order: 999, logo: null };
  };

  // Leer interacciones — KEYED BY FILE ID (único en Drive, nunca repite entre álbumes)
  let interactionsMap = {};
  let sheetInt = ss.getSheetByName("Interacciones");
  if(sheetInt) {
      const dataInt = sheetInt.getDataRange().getValues();
      // Columna 5 (índice 5) = File_ID, columna 4 (índice 4) = Nombre_Archivo (legacy)
      let userInteractions = {};
      for(let i=1; i<dataInt.length; i++) {
          const deDoc = dataInt[i][1] ? dataInt[i][1].toString() : "";
          const tipo  = dataInt[i][3] ? dataInt[i][3].toString() : "";
          // Usar File_ID si existe (nueva columna F), si no caer al nombre (legado)
          const fileKey = (dataInt[i][5] && dataInt[i][5].toString().trim() !== "")
                            ? dataInt[i][5].toString().trim()
                            : dataInt[i][4] ? dataInt[i][4].toString() : "";
          if (fileKey) {
              userInteractions[deDoc + "_" + fileKey] = { tipo: tipo, fileKey: fileKey };
          }
      }
      for (let key in userInteractions) {
          const item = userInteractions[key];
          if(!interactionsMap[item.fileKey]) interactionsMap[item.fileKey] = { like: 0, heart: 0, clap: 0, haha: 0 };
          if(interactionsMap[item.fileKey][item.tipo] !== undefined) {
              interactionsMap[item.fileKey][item.tipo]++;
          }
      }
  }

  let events = [];
  const idRegex = new RegExp("(^|_|\\\\s|-)" + userId + "(\\\\.|_|\\\\s|-|$)");

  while (folders.hasNext()) {
    const folder = folders.next();
    const folderName = folder.getName();
    if (folderName === "Fotos Perfil") continue;
    const folderInfo = findEventInfo(folderName);
    let eventData = { name: folderName, images: [], frames: { vertical: null, horizontal: null }, order: folderInfo.order, logo: folderInfo.logo };
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName();
      const lowerName = fileName.toLowerCase();
      
      // Si el archivo es un marco, guardamos su ID y evitamos que salga en la galería
      if (lowerName.includes("vertical") && (lowerName.includes(".png") || lowerName.includes(".jpg"))) {
          try {
              const blob = file.getBlob();
              eventData.frames.vertical = "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
          } catch(e) {}
          continue;
      } else if (lowerName.includes("horizontal") && (lowerName.includes(".png") || lowerName.includes(".jpg"))) {
          try {
              const blob = file.getBlob();
              eventData.frames.horizontal = "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
          } catch(e) {}
          continue;
      }
      
      let isForUser = fileName.includes("Todos") || idRegex.test(fileName);
      
      const fileId = file.getId();
      eventData.images.push({
        id: fileId,
        name: fileName,
        url: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000",
        rawUrl: "https://drive.google.com/uc?export=view&id=" + fileId,
        isForUser: isForUser,
        // Buscar stats primero por fileId (nuevo), luego por fileName (legado)
        stats: interactionsMap[fileId] || interactionsMap[fileName] || { like: 0, heart: 0, clap: 0, haha: 0 }
      });
    }
    if (eventData.images.length > 0) events.push(eventData);
  }
  
  // Ordenar eventos
  events.sort((a, b) => a.order - b.order);
  
  return { success: true, events: events };
}

function logActivity(documento, userDataStr, action) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Trazabilidad");
  if (!sheet) {
    sheet = ss.insertSheet("Trazabilidad");
    sheet.appendRow(["Fecha y Hora", "Documento", "Datos Usuario", "Acción"]);
  }
  sheet.appendRow([new Date(), documento, userDataStr, action]);
  return { success: true };
}

function getUsers() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  let users = [];
  for (let i = 1; i < data.length; i++) {
    // Mostrar todos los usuarios con cédula, estén o no confirmados
    if(data[i][1]) {
      users.push({
        id: data[i][0],
        documento: data[i][1],
        nombre: data[i][2],
        apellido: "",
        email: data[i][4],
        confirmado: (data[i][8] instanceof Date) ? Utilities.formatDate(data[i][8], "America/Bogota", "yyyy-MM-dd HH:mm:ss") : (data[i][8] || "No"),
        rol: data[i][9]
      });
    }
  }
  return { success: true, users: users };
}

function saveValoracion(doc, nombre, cargo, calificacion, comentarios) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Valoración");
  if(!sheet) {
      sheet = ss.insertSheet("Valoración");
      sheet.appendRow(["Id", "Cédula", "Nombre", "Cargo", "Calificación", "Comentarios"]);
  }
  sheet.appendRow([Utilities.getUuid(), doc, nombre, cargo, calificacion, comentarios]);
  return { success: true, message: "Valoración enviada exitosamente" };
}

// logInteraction ahora recibe también el fileId para identificación única
function logInteraction(doc, nombre, tipo, fileName, fileId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Interacciones");
  if(!sheet) {
      sheet = ss.insertSheet("Interacciones");
      // Nueva columna F = File_ID (clave única, no depende del nombre)
      sheet.appendRow(["Fecha", "De_Documento", "De_Nombre", "Tipo", "Nombre_Archivo", "File_ID"]);
  }
  // Verificar si existe encabezado de File_ID (para hojas existentes sin esa columna)
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];
  if (!headers[5] || headers[5].toString().trim() === "") {
    sheet.getRange(1, 6).setValue("File_ID");
  }
  
  // Guardar con fileId en columna 6
  sheet.appendRow([new Date(), doc, nombre, tipo, fileName, fileId || ""]);
  
  // También registrar en trazabilidad
  logActivity(doc, JSON.stringify({nombre: nombre}), "Interacción: " + tipo + " en foto " + fileName + " (ID: " + fileId + ")");
  
  // Calcular los nuevos stats — usar fileId si disponible, sino fileName (legado)
  const dataInt = sheet.getDataRange().getValues();
  let fileInteractions = {};
  const useId = fileId && fileId.trim() !== "";
  
  for(let i=1; i<dataInt.length; i++) {
      // La clave es: fileId (col 6) si existe, sino fileName (col 5)
      const rowKey = (dataInt[i][5] && dataInt[i][5].toString().trim() !== "")
                       ? dataInt[i][5].toString().trim()
                       : dataInt[i][4] ? dataInt[i][4].toString() : "";
      const targetKey = useId ? fileId : fileName;
      
      if(rowKey === targetKey) {
          const deDoc = dataInt[i][1] ? dataInt[i][1].toString() : "";
          const t = dataInt[i][3] ? dataInt[i][3].toString() : "";
          fileInteractions[deDoc] = t;
      }
  }
  let newStats = { like: 0, heart: 0, clap: 0, haha: 0 };
  for(let key in fileInteractions) {
      const t = fileInteractions[key];
      if(newStats[t] !== undefined) newStats[t]++;
  }
  
  return { success: true, newStats: newStats };
}

function getUserStats(doc) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Interacciones");
  let stats = { like: 0, heart: 0, clap: 0, haha: 0 };
  if(!sheet) return { success: true, stats: stats };
  
  const data = sheet.getDataRange().getValues();
  let userInteractions = {};
  
  for(let i=1; i<data.length; i++) {
      const deDoc = data[i][1] ? data[i][1].toString() : "";
      const tipo = data[i][3] ? data[i][3].toString() : "";
      const fileName = data[i][4] ? data[i][4].toString() : "";
      
      if (fileName.includes(doc)) {
          userInteractions[deDoc + "_" + fileName] = tipo;
      }
  }
  
  for (let key in userInteractions) {
      const tipo = userInteractions[key];
      if (stats[tipo] !== undefined) {
          stats[tipo]++;
      }
  }
  
  return { success: true, stats: stats };
}

function getAdminDashboard() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  let ingresos = 0, aperturas = 0, descargas = 0;
  let trazSheet = ss.getSheetByName("Trazabilidad");
  if(trazSheet) {
      const data = trazSheet.getDataRange().getValues();
      for(let i=1; i<data.length; i++) {
          const actionStr = (data[i][3] || "").toString().toLowerCase();
          if(actionStr.includes("ingreso exitoso")) ingresos++;
          else if(actionStr.includes("apertura de imagen")) aperturas++;
          else if(actionStr.includes("descarga de imagen")) descargas++;
      }
  }
  
  let valCount = 0, valSum = 0;
  let valSheet = ss.getSheetByName("Valoración");
  if(valSheet) {
      const data = valSheet.getDataRange().getValues();
      for(let i=1; i<data.length; i++) {
          const val = parseFloat(data[i][4]);
          if(!isNaN(val)) {
              valSum += val;
              valCount++;
          }
      }
  }
  let avgVal = valCount > 0 ? (valSum / valCount).toFixed(1) : "0.0";
  
  return { success: true, dashboard: { ingresos, aperturas, descargas, valoraciones: avgVal } };
}

// ==========================================
// CÓDIGO DEL USUARIO PARA GENERACIÓN DE TOKENS
// ==========================================

function onEdit(e) {
  if (!e || !e.range) return;

  const hoja = e.range.getSheet();
  const fila = e.range.getRow();
  const columna = e.range.getColumn();

  if (fila < 2) return;
  if (columna !== 1 && columna !== 2) return;

  const cedula = hoja.getRange(fila, 2).getValue(); 
  const celdaToken = hoja.getRange(fila, 7); 

  if (cedula === "" || cedula === null) return;
  if (celdaToken.getValue() !== "") return;

  const token = generarTokenUnico(hoja);
  celdaToken.setValue(token);
}

function generarTokenUnico(hoja) {
  const ultimaFila = hoja.getLastRow();
  let tokensExistentes = [];

  if (ultimaFila >= 2) {
    tokensExistentes = hoja
      .getRange(2, 7, ultimaFila - 1, 1) 
      .getValues()
      .flat()
      .map(String);
  }

  let token;
  let existe = true;

  while (existe) {
    token = Math.floor(100000 + Math.random() * 900000).toString();
    existe = tokensExistentes.includes(token);
  }

  return token;
}

