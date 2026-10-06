// ==========================================
// CONFIGURACIÓN (EL USUARIO DEBE ACTUALIZARLA)
// ==========================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyUoFVOuy4EaXYOGk0Suc-cGeOdWhmWnaEGcuO_FbUx01ANFX_W86Znj5YzGqk8EBa3ng/exec'; // Se debe actualizar si cambia

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = null;
let currentDocumento = null;
let eventsData = [];
let framesData = {};
let currentAlbumImages = [];
let currentImageIndex = 0;
let originalAdminUser = null;  // Para suplantación: guarda el admin real
const EVENTS_CACHE_KEY = 'nm_events_cache';
const EVENTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos de caché

// ==========================================
// ELEMENTOS DEL DOM
// ==========================================
const views = {
    login: document.getElementById('loginView'),
    token: document.getElementById('tokenView'),
    gallery: document.getElementById('galleryView'),
    admin: document.getElementById('adminView')
};

const modals = {
    compromiso: document.getElementById('compromisoModal'),
    image: document.getElementById('imageModal'),
    rating: document.getElementById('ratingModal'),
    profile: document.getElementById('profileModal')
};

// ==========================================
// EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Autenticación
    document.getElementById('requestTokenBtn').addEventListener('click', requestToken);
    document.getElementById('verifyTokenBtn').addEventListener('click', verifyToken);
    document.getElementById('backToLoginBtn').addEventListener('click', () => switchView('login'));
    
    // Modal Compromisos
    document.getElementById('acceptTerms').addEventListener('change', (e) => {
        document.getElementById('enterGalleryBtn').disabled = !e.target.checked;
    });
    document.getElementById('enterGalleryBtn').addEventListener('click', enterGallery);
    
    // Header
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('adminBtn').addEventListener('click', () => switchView('admin'));
    document.getElementById('closeAdminBtn').addEventListener('click', () => switchView('gallery'));
    
    // Tabs Galería
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        });
    });

    // Admin PDF
    document.getElementById('selectAllUsers').addEventListener('change', (e) => {
        document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = e.target.checked);
        updatePdfButtonState();
    });
    document.getElementById('downloadPdfBtn').addEventListener('click', generatePdf);
    
    // Cerrar Modales
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal-overlay').style.display = 'none';
        });
    });
    document.getElementById('prevImageBtn').addEventListener('click', () => navigateImage(-1));
    document.getElementById('nextImageBtn').addEventListener('click', () => navigateImage(1));
    
    // Rating Portal
    document.getElementById('ratePortalBtn').addEventListener('click', () => {
        modals.rating.style.display = 'flex';
    });
    document.getElementById('closeRatingModal').addEventListener('click', () => {
        modals.rating.style.display = 'none';
    });
    
    let currentRating = 0;
    document.querySelectorAll('.stars i').forEach(star => {
        star.addEventListener('click', (e) => {
            currentRating = e.target.dataset.val;
            document.querySelectorAll('.stars i').forEach(s => {
                s.classList.remove('fa-solid', 'active');
                s.classList.add('fa-regular');
                if (s.dataset.val <= currentRating) {
                    s.classList.remove('fa-regular');
                    s.classList.add('fa-solid', 'active');
                }
            });
        });
    });
    
    document.getElementById('submitRatingBtn').addEventListener('click', async () => {
        if (currentRating == 0) return alert('Por favor selecciona una calificación de 1 a 5 estrellas.');
        const comment = document.getElementById('ratingComment').value;
        const btn = document.getElementById('submitRatingBtn');
        btn.disabled = true; btn.innerHTML = 'Enviando...';
        
        await callApi('saveValoracion', {
            documento: currentUser.documento,
            nombre: currentUser.nombre,
            cargo: currentUser.cargo || 'Colaborador',
            calificacion: currentRating,
            comentarios: comment
        });
        
        btn.disabled = false; btn.innerHTML = 'Enviar Calificación';
        modals.rating.style.display = 'none';
        alert('¡Gracias por tu valoración!');
    });
    
    // Perfil y Estadísticas
    document.getElementById('profileBtn').addEventListener('click', () => {
        openProfileModal();
    });
    document.getElementById('closeProfileModal').addEventListener('click', () => {
        modals.profile.style.display = 'none';
    });
    
    // Interacciones (Botones dentro del modal de imagen)
    document.querySelectorAll('.int-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = e.currentTarget.dataset.type;
            const currentImg = currentAlbumImages[currentImageIndex];
            
            // Animacion feedback
            e.currentTarget.style.transform = 'scale(1.5)';
            setTimeout(() => e.currentTarget.style.transform = '', 200);
            
            const rect = e.currentTarget.getBoundingClientRect();
            let iconClass = 'fa-heart';
            let color = '#ff4757';
            if (type === 'like') { iconClass = 'fa-thumbs-up'; color = '#43bff5'; }
            else if (type === 'clap') { iconClass = 'fa-hands-clapping'; color = '#feca57'; }
            else if (type === 'haha') { iconClass = 'fa-face-laugh-squint'; color = '#ff9f43'; }
            
            createFloatingIcon(rect.left + rect.width / 2, rect.top, iconClass, color);
            
            const res = await callApi('logInteraction', {
                documento: currentUser.documento,
                nombre: currentUser.nombre,
                tipo: type,
                fileName: currentImg.name,
                fileId: currentImg.id   // ID único de Drive — evita colisiones por nombre
            });
            
            if (res.success && res.newStats) {
                currentImg.stats = res.newStats;
                document.querySelectorAll(`.polaroid-item[data-url="${currentImg.url}"]`).forEach(polaroid => {
                    polaroid.querySelector('.st-heart').innerText = res.newStats.heart;
                    polaroid.querySelector('.st-like').innerText = res.newStats.like;
                    polaroid.querySelector('.st-clap').innerText = res.newStats.clap;
                    polaroid.querySelector('.st-haha').innerText = res.newStats.haha;
                });
            }
        });
    });
});

function createFloatingIcon(x, y, iconClass, color) {
    for (let i = 0; i < 6; i++) {
        const icon = document.createElement('i');
        icon.className = `fa-solid ${iconClass} floating-icon`;
        icon.style.color = color;
        icon.style.left = (x + (Math.random() * 60 - 30)) + 'px';
        icon.style.top = (y + (Math.random() * 20 - 10)) + 'px';
        icon.style.fontSize = (1.2 + Math.random()) + 'rem';
        document.body.appendChild(icon);
        setTimeout(() => icon.remove(), 1000);
    }
}

// Helper de foto de perfil
function setProfilePhoto(imgElement, user) {
    if (!user || !user.documento) return;
    const docStr = user.documento.toString().trim();
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre)}&background=01326c&color=fff`;
    
    imgElement.onerror = function() {
        if (this.src.includes('.png')) {
            this.src = `./Foto%20de%20Perfil/${encodeURIComponent(docStr)}.jpg`;
        } else if (!this.src.startsWith('https://ui-avatars')) {
            this.src = fallbackUrl;
        }
    };
    imgElement.src = `./Foto%20de%20Perfil/${encodeURIComponent(docStr)}.png`;
}

// ==========================================
// FUNCIONES DE API
// ==========================================
async function callApi(action, payload = {}) {
    if (GAS_URL === 'PEGAR_AQUI_LA_URL_DE_TU_WEB_APP' || GAS_URL === '') {
        alert('Por favor, configura la URL de tu Web App de Google Apps Script en el archivo js/app.js');
        return { success: false, message: "URL no configurada" };
    }

    payload.action = action;
    
    // Estrategia 1: GET con parámetros en la URL
    // GAS acepta GET sin restricciones de CORS desde cualquier origen
    // Esta es la forma más compatible con localhost, file://, etc.
    try {
        const url = new URL(GAS_URL);
        // Serializar todo el payload como parámetros GET
        Object.entries(payload).forEach(([k, v]) => {
            if (v !== undefined && v !== null) {
                url.searchParams.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
            }
        });
        
        const getResp = await fetch(url.toString(), {
            method: 'GET',
            redirect: 'follow'
        });
        
        if (getResp.ok) {
            const text = await getResp.text();
            try {
                return JSON.parse(text);
            } catch {
                // La respuesta no es JSON — probar con POST
            }
        }
    } catch (getErr) {
        console.warn('API GET fallido, intentando POST:', getErr.message);
    }

    // Estrategia 2: POST con Content-Type text/plain (evita preflight CORS en GAS)
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow'
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('POST response not OK: ' + response.status);
    } catch (postErr) {
        console.error('API Error (POST):', postErr);
        return { success: false, message: "Error de conexión con el servidor. Verifica tu conexión a internet." };
    }
}

// ==========================================
// AUTENTICACIÓN
// ==========================================
async function requestToken() {
    const doc = document.getElementById('documentoInput').value.trim();
    if (!doc) return showMessage('loginMessage', 'Por favor ingresa tu documento.', false);
    
    const btn = document.getElementById('requestTokenBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
    
    const res = await callApi('requestToken', { documento: doc });
    
    btn.disabled = false;
    btn.innerHTML = 'Ingresar';
    
    if (res.success) {
        currentDocumento = doc;
        
        // Si el usuario ya está confirmado, saltamos el paso de token
        if (res.skipToken) {
            currentUser = res.userData;
            document.getElementById('userActions').style.display = 'flex';
            document.getElementById('userNameHeader').innerText = currentUser.nombre;
            setProfilePhoto(document.getElementById('userAvatar'), currentUser);
            
            if (currentUser.rol && currentUser.rol.toLowerCase() === 'administrador') {
                document.getElementById('adminBtn').style.display = 'block';
                loadAdminData();
            }
            
            switchView('gallery');
            loadGallery();
        } else {
            document.getElementById('tokenHint').innerText = `Se ha enviado un token a tu correo (${res.emailHint})`;
            switchView('token');
        }
    } else {
        showMessage('loginMessage', res.message, false);
    }
}

async function verifyToken() {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token || token.length !== 6) return showMessage('tokenMessage', 'Ingresa un token válido de 6 dígitos.', false);
    
    const btn = document.getElementById('verifyTokenBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';
    
    const res = await callApi('verifyToken', { documento: currentDocumento, token: token });
    
    btn.disabled = false;
    btn.innerHTML = 'Validar Token';
    
    if (res.success) {
        currentUser = res.userData;
        showCompromisoModal();
    } else {
        showMessage('tokenMessage', res.message, false);
    }
}

function showCompromisoModal() {
    document.getElementById('modalUserDoc').innerText = `Doc: ${currentUser.documento}`;
    document.getElementById('modalUserName').innerText = currentUser.nombre;
    document.getElementById('modalUserEmail').innerText = currentUser.email;
    setProfilePhoto(document.getElementById('modalUserFoto'), currentUser);
    
    modals.compromiso.style.display = 'flex';
}

function enterGallery() {
    modals.compromiso.style.display = 'none';
    
    document.getElementById('userActions').style.display = 'flex';
    document.getElementById('userNameHeader').innerText = currentUser.nombre;
    setProfilePhoto(document.getElementById('userAvatar'), currentUser);
    
    if (currentUser.rol && currentUser.rol.toLowerCase() === 'administrador') {
        document.getElementById('adminBtn').style.display = 'block';
        loadAdminData();
    }
    
    switchView('gallery');
    loadGallery();
}

function logout() {
    currentUser = null;
    currentDocumento = null;
    document.getElementById('userActions').style.display = 'none';
    document.getElementById('adminBtn').style.display = 'none';
    document.getElementById('documentoInput').value = '';
    document.getElementById('tokenInput').value = '';
    document.getElementById('acceptTerms').checked = false;
    document.getElementById('enterGalleryBtn').disabled = true;
    switchView('login');
}

// ==========================================
// GALERÍA
// ==========================================
async function loadGallery(forceRefresh = false) {
    const cacheKey = EVENTS_CACHE_KEY + '_' + (currentUser.id || currentUser.documento);
    
    // Intentar cargar desde caché primero (evita los 30 segundos de espera)
    if (!forceRefresh) {
        try {
            const cached = sessionStorage.getItem(cacheKey);
            const cachedTs = sessionStorage.getItem(cacheKey + '_ts');
            if (cached && cachedTs && Date.now() - parseInt(cachedTs) < EVENTS_CACHE_TTL) {
                eventsData = JSON.parse(cached);
                renderGallery();
                // Actualizar en segundo plano sin bloquear la UI
                callApi('getEvents', { userId: currentUser.id }).then(res => {
                    if (res.success) {
                        eventsData = res.events.sort((a, b) => a.order - b.order);
                        sessionStorage.setItem(cacheKey, JSON.stringify(eventsData));
                        sessionStorage.setItem(cacheKey + '_ts', Date.now().toString());
                        renderGallery();
                    }
                });
                return;
            }
        } catch(e) { /* ignore cache errors */ }
    }
    
    // Sin caché — mostrar skeleton mientras carga
    const misFotosGrid = document.getElementById('misFotosGrid');
    misFotosGrid.innerHTML = '<div class="loading-skeleton"><i class="fa-solid fa-spinner fa-spin"></i> Cargando tus fotos...</div>';
    
    const res = await callApi('getEvents', { userId: currentUser.id });
    if (res.success) {
        eventsData = res.events.sort((a, b) => a.order - b.order);
        
        // Guardar en caché
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(eventsData));
            sessionStorage.setItem(cacheKey + '_ts', Date.now().toString());
        } catch(e) { /* ignore */ }
        renderGallery();
    } else {
        misFotosGrid.innerHTML = `<p class="error">Error al cargar: ${res.message}</p>`;
    }
}

function renderGallery() {
    const misFotosGrid = document.getElementById("misFotosGrid");
    const eventosContainer = document.getElementById("eventosContainer");
    
    misFotosGrid.innerHTML = "";
    eventosContainer.innerHTML = "";
    
    let hasMyPhotos = false;

    // Llenar "Mis Fotos" con polaroids
    eventsData.forEach((event, index) => {
        event.images.forEach(img => {
            img.albumIndex = index;
            if (img.isForUser) {
                hasMyPhotos = true;
                misFotosGrid.appendChild(createPolaroidElement(img));
            }
        });
    });
    if (!hasMyPhotos) {
        misFotosGrid.innerHTML = "<p>No se encontraron fotos tuyas por el momento.</p>";
    }
    
    // Llenar "Eventos" con carátulas de álbumes (Diseño de pila de fotos)
    eventsData.forEach((event, index) => {
        // Tomamos hasta 3 fotos para el fondo de la pila
        const bgPhotos = event.images.slice(0, 3);
        const card = document.createElement("div");
        card.className = "album-card stack-design";
        card.onclick = () => openAlbum(index);
        
        let photosHtml = '';
        bgPhotos.forEach((img, i) => {
            // Posicionamos las fotos rotadas como fondo
            const rotation = i === 0 ? -15 : i === 1 ? 15 : 0;
            const zIndex = i;
            photosHtml += `<div class="stack-photo" style="transform: rotate(${rotation}deg); z-index: ${zIndex};"><img src="${img.url}" loading="lazy"></div>`;
        });

        let logoHtml = '';
        let hasLogo = false;
        let proxyLogoUrl = '';
        if (event.logo) {
            hasLogo = true;
            proxyLogoUrl = GAS_URL + '?action=proxyImage&url=' + encodeURIComponent(event.logo);
            logoHtml = `<img id="logo-${index}" class="album-center-logo" alt="Logo Evento" style="display:none">`;
        }
        
        card.innerHTML = `
            <div class="album-stack">
                ${photosHtml}
                ${logoHtml}
            </div>
            <h3 class="album-stack-title">${event.name}</h3>
        `;
        eventosContainer.appendChild(card);
        
        if (hasLogo) {
            fetch(proxyLogoUrl)
                .then(r => r.text())
                .then(base64 => {
                    if (base64 && base64.startsWith("data:image")) {
                        const imgEl = document.getElementById(`logo-${index}`);
                        if (imgEl) {
                            imgEl.src = base64;
                            imgEl.style.display = 'block';
                        }
                    }
                })
                .catch(e => console.warn("Error cargando logo del álbum", e));
        }
    });
    
    // Event listener para cerrar álbum
    document.getElementById("backToAlbumsBtn").onclick = () => {
        document.getElementById("singleAlbumContainer").style.display = "none";
        document.getElementById("eventosContainer").style.display = "flex";
        document.getElementById("backToAlbumsBtn").style.display = "none";
    };
}

function openAlbum(index) {
    const event = eventsData[index];
    const grid = document.getElementById("singleAlbumGrid");
    
    document.getElementById("singleAlbumTitle").innerText = event.name;
    grid.innerHTML = "";
    
    event.images.forEach(img => {
        grid.appendChild(createPolaroidElement(img));
    });
    
    document.getElementById("eventosContainer").style.display = "none";
    document.getElementById("singleAlbumContainer").style.display = "block";
    document.getElementById("backToAlbumsBtn").style.display = "block";
}

function createPolaroidElement(img) {
    const div = document.createElement("div");
    div.className = "polaroid-item";
    div.dataset.url = img.url;
    div.dataset.rawurl = img.rawUrl;
    div.dataset.albumindex = img.albumIndex;
    
    const stats = img.stats || { like: 0, heart: 0, clap: 0, haha: 0 };
    
    let statsHtml = '';
    if (stats.heart > 0) statsHtml += `<span title="Me Encanta"><i class="fa-solid fa-heart" style="color: #ff4757;"></i> <b class="st-heart">${stats.heart}</b></span>`;
    if (stats.like > 0) statsHtml += `<span title="Me Gusta"><i class="fa-solid fa-thumbs-up" style="color: #43bff5;"></i> <b class="st-like">${stats.like}</b></span>`;
    if (stats.clap > 0) statsHtml += `<span title="Aplausos"><i class="fa-solid fa-hands-clapping" style="color: #feca57;"></i> <b class="st-clap">${stats.clap}</b></span>`;
    if (stats.haha > 0) statsHtml += `<span title="Me Divierte"><i class="fa-solid fa-face-laugh-squint" style="color: #ff9f43;"></i> <b class="st-haha">${stats.haha}</b></span>`;

    div.innerHTML = `
        <img src="${img.url}" loading="lazy">
        <div class="overlay-icon"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
        <div class="polaroid-stats" style="justify-content: flex-start; gap: 15px;">
            ${statsHtml}
        </div>
    `;
    div.onclick = () => openImageModal(img.url, img.rawUrl, img.albumIndex);
    return div;
}

// ==========================================
// PROCESAMIENTO DE IMAGEN (CANVAS)
// ==========================================
function openImageModal(imgUrl, rawUrl, albumIndex) {
    if (eventsData[albumIndex] && eventsData[albumIndex].images) {
        currentAlbumImages = eventsData[albumIndex].images;
        currentImageIndex = currentAlbumImages.findIndex(i => i.url === imgUrl);
    }
    
    modals.image.style.display = "flex";
    const canvas = document.getElementById("photoCanvas");
    const ctx = canvas.getContext("2d");
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 600; canvas.height = 300;
    
    ctx.font = "18px Inter";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.fillText("Cargando imagen...", 300, 150);
    ctx.textAlign = "left";

    // Botón de ampliar eliminado según requerimiento
    const expandBtn = document.getElementById("expandImageBtn");
    if (expandBtn) expandBtn.remove();
    
    // Intentar cargar la imagen sin CORS para garantizar que se vea
    function tryLoadImage(src, isFallback) {
        const photo = new Image();
        photo.onload = () => {
            const isVertical = photo.height > photo.width;
            const albumFrames = eventsData[albumIndex]?.frames || { vertical: null, horizontal: null };
            const frameBase64 = isVertical ? albumFrames.vertical : albumFrames.horizontal;
            
            if (frameBase64) {
                // Al cargar sin crossOrigin, se manchará el canvas, pero se verá
                drawPhotoWithFrame(photo, frameBase64, canvas, ctx, true, rawUrl);
            } else {
                // Sin marco: mostrar la foto directamente en el canvas
                const maxW = Math.min(photo.naturalWidth  || 1200, 1200);
                const maxH = Math.min(photo.naturalHeight || 900, 900);
                const ratio = Math.min(maxW / (photo.naturalWidth || 1), maxH / (photo.naturalHeight || 1));
                canvas.width  = Math.round((photo.naturalWidth  || 800) * ratio);
                canvas.height = Math.round((photo.naturalHeight || 600) * ratio);
                ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
                
                const btn = document.getElementById("downloadImageBtn");
                btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar Original';
                btn.onclick = () => {
                    const link = document.createElement("a");
                    link.download = `BaseTek_${Date.now()}.jpg`;
                    link.href = rawUrl; 
                    link.click();
                };
            }
            
            callApi("logActivity", { 
                documento: currentUser.documento, 
                userObj: JSON.stringify(currentUser), 
                activity: "Apertura de imagen" 
            });
        };
        photo.onerror = () => {
            if (!isFallback && rawUrl && rawUrl !== src) {
                tryLoadImage(rawUrl, true);
            } else {
                // Imagen completamente rota
                canvas.width = 500; canvas.height = 140;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = 'bold 15px Inter';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.textAlign = 'center';
                ctx.fillText('No se pudo cargar la imagen.', 250, 45);
                ctx.font = '13px Inter';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('Intenta abrirla desde Google Drive.', 250, 75);
                ctx.textAlign = 'left';
                
                const btn = document.getElementById("downloadImageBtn");
                btn.innerHTML = '<i class="fa-solid fa-external-link"></i> Ver en Google Drive';
                btn.onclick = () => window.open(rawUrl, '_blank');
            }
        };
        photo.src = src; // Sin crossOrigin
    }
    
    // Probar primero con URL original proxyificada si es de Drive o con s1200
    const isDrive = imgUrl.includes('drive.google.com') || imgUrl.includes('googleusercontent');
    const thumbSrc = isDrive ? imgUrl.replace("w1000", "s1200").replace("w800", "s1200") : imgUrl;
    tryLoadImage(thumbSrc, false);
}



function navigateImage(direction) {
    if (!currentAlbumImages || currentAlbumImages.length === 0) return;
    currentImageIndex += direction;
    if (currentImageIndex < 0) currentImageIndex = currentAlbumImages.length - 1;
    if (currentImageIndex >= currentAlbumImages.length) currentImageIndex = 0;
    
    const img = currentAlbumImages[currentImageIndex];
    openImageModal(img.url, img.rawUrl, img.albumIndex);
}

// ==========================================
// HELPER: Dibujar foto + marco en canvas
// ==========================================
function drawPhotoWithFrame(photo, frameBase64, canvas, ctx, isTainted = false, originalSrc = '') {
    const frame = new Image();
    frame.onload = () => {
        // Canvas toma el tamaño EXACTO del marco
        canvas.width  = frame.width;
        canvas.height = frame.height;

        // Escalar foto como object-fit: cover
        const hRatio = canvas.width  / photo.width;
        const vRatio = canvas.height / photo.height;
        const ratio  = Math.max(hRatio, vRatio);

        const shiftX = (canvas.width  - photo.width  * ratio) / 2;
        const shiftY = (canvas.height - photo.height * ratio) / 2;

        // 1. Foto escalada y centrada
        ctx.drawImage(photo, 0, 0, photo.width, photo.height,
                      shiftX, shiftY, photo.width * ratio, photo.height * ratio);

        // 2. Marco encima
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

        // Botón de descarga
        const btn = document.getElementById('downloadImageBtn');
        btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar Imagen Enmarcada';

        if (isTainted && originalSrc) {
            btn.onclick = async () => {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparando descarga...';
                try {
                    const scriptUrl = GAS_URL + '?action=proxyImage&url=' + encodeURIComponent(originalSrc);
                    const res = await fetch(scriptUrl);
                    const base64 = await res.text();
                    if (base64 && base64.startsWith("data:image")) {
                        const tempImg = new Image();
                        tempImg.onload = () => {
                            const tempCanvas = document.createElement("canvas");
                            tempCanvas.width = canvas.width;
                            tempCanvas.height = canvas.height;
                            const tempCtx = tempCanvas.getContext("2d");
                            
                            const tRatio = Math.max(tempCanvas.width / tempImg.width, tempCanvas.height / tempImg.height);
                            const tShiftX = (tempCanvas.width - tempImg.width * tRatio) / 2;
                            const tShiftY = (tempCanvas.height - tempImg.height * tRatio) / 2;
                            
                            tempCtx.drawImage(tempImg, 0, 0, tempImg.width, tempImg.height, tShiftX, tShiftY, tempImg.width * tRatio, tempImg.height * tRatio);
                            tempCtx.drawImage(frame, 0, 0, tempCanvas.width, tempCanvas.height);
                            
                            const link = document.createElement('a');
                            link.download = `BaseTek_${Date.now()}.png`;
                            link.href = tempCanvas.toDataURL('image/png');
                            link.click();
                            btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar Imagen Enmarcada';
                        };
                        tempImg.src = base64;
                        return;
                    }
                } catch (proxyErr) {
                    console.warn("Proxy falló en descarga", proxyErr);
                }
                // Si el proxy falla, abrir la imagen original en una nueva pestaña
                window.open(originalSrc, '_blank');
                btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar Imagen Enmarcada';
            };
        } else {
            btn.onclick = () => {
                try {
                    const link = document.createElement('a');
                    link.download = `BaseTek_${Date.now()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                } catch (e) {
                    window.open(currentAlbumImages[currentImageIndex]?.rawUrl || '', '_blank');
                }
            };
        }
    };
    frame.src = frameBase64;
}


// ==========================================
// ADMINISTRADOR (PDF)
// ==========================================
async function loadAdminData() {
    const dashRes = await callApi('getAdminDashboard');
    if(dashRes.success) {
        document.getElementById('dash-ingresos').innerText = dashRes.dashboard.ingresos;
        document.getElementById('dash-aperturas').innerText = dashRes.dashboard.aperturas;
        document.getElementById('dash-descargas').innerText = dashRes.dashboard.descargas;
        document.getElementById('dash-valoraciones').innerText = dashRes.dashboard.valoraciones;
    }

    const res = await callApi('getUsers');
    if (res.success) {
        window.adminUsersList = res.users; // Guardar en variable global para fácil acceso
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        res.users.forEach((u, idx) => {
            tbody.innerHTML += `
                <tr>
                    <td><input type="checkbox" class="user-checkbox" data-user='${JSON.stringify(u)}'></td>
                    <td>${u.documento}</td>
                    <td>${u.nombre}</td>
                    <td>${u.email}</td>
                    <td><span style="color: #43bff5;"><i class="fa-solid fa-check"></i> ${u.confirmado}</span></td>
                    <td>${u.rol || 'Colaborador'}</td>
                    <td>
                        <button class="btn-impersonate" onclick="impersonateUser(${idx})" title="Ingresar como ${u.nombre}">
                            <i class="fa-solid fa-user-secret"></i> Ingresar como
                        </button>
                    </td>
                </tr>
            `;
        });
        
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.addEventListener('change', updatePdfButtonState);
        });
    }
}

function updatePdfButtonState() {
    const anyChecked = Array.from(document.querySelectorAll('.user-checkbox')).some(cb => cb.checked);
    document.getElementById('downloadPdfBtn').disabled = !anyChecked;
}

function generatePdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const selectedUsers = Array.from(document.querySelectorAll('.user-checkbox:checked'))
                              .map(cb => JSON.parse(cb.dataset.user));
    
    selectedUsers.forEach((user, index) => {
        if (index > 0) doc.addPage();
        
        doc.setFillColor(1, 50, 108); // var(--primary)
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("Acta de Compromiso - BaseTek", 105, 20, { align: "center" });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text(`Fecha de Confirmación: ${user.confirmado}`, 20, 45);
        doc.text(`Colaborador: ${user.nombre}`, 20, 55);
        doc.text(`Documento: ${user.documento}`, 20, 65);
        doc.text(`Correo: ${user.email}`, 20, 75);
        
        doc.setFontSize(14);
        doc.text("Términos de Uso y Tratamiento de Imagen Aceptados:", 20, 95);
        
        doc.setFontSize(10);
        const terminos = [
            "1. Uso exclusivo personal e interno: El material disponible está destinado únicamente al recuerdo personal y al fortalecimiento de nuestra cultura corporativa. Queda prohibido el uso comercial o su difusión pública no autorizada fuera del entorno laboral.",
            "2. Respeto a la privacidad e imagen ajena: Puedes descargar tus fotografías libremente. Si deseas publicar en redes sociales fotos donde aparezcan compañeros de equipo, asegúrate de contar previamente con su consentimiento.",
            "3. Tratamiento de Datos Personales: Las fotografías fueron capturadas en el marco de actividades corporativas y son tratadas bajo la Política de Tratamiento de Datos Personales de BaseTek (Ley 1581 de 2012).",
            "4. Derecho de supresión (Habeas Data): Si por alguna razón prefieres que una imagen en la que apareces sea retirada de la plataforma, puedes solicitarlo en cualquier momento al área encargada (Talento Humano / Comunicaciones) y se procederá a su eliminación de la galería pública."
        ];
        
        let y = 110;
        terminos.forEach(t => {
            const lines = doc.splitTextToSize(t, 170);
            doc.text(lines, 20, y);
            y += (lines.length * 5) + 5;
        });
        
        doc.setFontSize(12);
        doc.text("___________________________________", 20, y + 30);
        doc.text("Aceptado Digitalmente en Plataforma", 20, y + 40);
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("Registro almacenado en Base de Datos de BaseTek", 20, y + 50);
    });
    
    doc.save(`Actas_BaseTek_${new Date().getTime()}.pdf`);
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active-view'));
    views[viewName].classList.add('active-view');
}

function showMessage(elementId, msg, isSuccess) {
    const el = document.getElementById(elementId);
    el.innerText = msg;
    el.className = 'message ' + (isSuccess ? 'success' : 'error');
}

async function openProfileModal() {
    document.getElementById('profileModalName').innerText = currentUser.nombre;
    document.getElementById('profileModalCargo').innerText = currentUser.cargo || 'Colaborador';
    setProfilePhoto(document.getElementById('profileModalFoto'), currentUser);
    
    modals.profile.style.display = 'flex';
    
    let totalStats = { like: 0, heart: 0, clap: 0, haha: 0 };
    eventsData.forEach(event => {
        event.images.forEach(img => {
            if (img.isForUser && img.stats) {
                totalStats.like += img.stats.like || 0;
                totalStats.heart += img.stats.heart || 0;
                totalStats.clap += img.stats.clap || 0;
                totalStats.haha += img.stats.haha || 0;
            }
        });
    });
    
    document.getElementById('stat-like').innerText = totalStats.like;
    document.getElementById('stat-heart').innerText = totalStats.heart;
    document.getElementById('stat-clap').innerText = totalStats.clap;
    document.getElementById('stat-haha').innerText = totalStats.haha;
}


// ==========================================
// SUPLANTACIÓN DE USUARIO (ADMIN)
// ==========================================
function impersonateUser(userIndexOrObj) {
    let targetUser;
    if (typeof userIndexOrObj === 'number') {
        targetUser = window.adminUsersList[userIndexOrObj];
    } else {
        targetUser = userIndexOrObj;
    }
    
    if (!originalAdminUser) {
        originalAdminUser = JSON.parse(JSON.stringify(currentUser));
    }
    
    currentUser = targetUser;
    currentDocumento = targetUser.documento;
    
    document.getElementById('userNameHeader').innerHTML = `<i class="fa-solid fa-user-secret" style="color: #ff4757;"></i> Suplantando a: ${currentUser.nombre}`;
    setProfilePhoto(document.getElementById('userAvatar'), currentUser);
    document.getElementById('adminBtn').style.display = 'none'; // Ocultar admin panel mientras suplanta
    
    // Mostrar botón para salir de suplantación si no existe
    let stopImpersonationBtn = document.getElementById('stopImpersonationBtn');
    if (!stopImpersonationBtn) {
        stopImpersonationBtn = document.createElement('button');
        stopImpersonationBtn.id = 'stopImpersonationBtn';
        stopImpersonationBtn.className = 'btn-secondary';
        stopImpersonationBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Salir de Suplantación';
        stopImpersonationBtn.onclick = stopImpersonation;
        document.getElementById('userActions').insertBefore(stopImpersonationBtn, document.getElementById('logoutBtn'));
    }
    stopImpersonationBtn.style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none'; // Ocultar logout normal
    
    switchView('gallery');
    loadGallery(true); // Forzar refresh para evitar caché del admin
}


function stopImpersonation() {
    if (!originalAdminUser) return;
    
    currentUser = originalAdminUser;
    currentDocumento = originalAdminUser.documento;
    originalAdminUser = null;
    
    document.getElementById('userNameHeader').innerText = currentUser.nombre;
    setProfilePhoto(document.getElementById('userAvatar'), currentUser);
    
    if (currentUser.rol && currentUser.rol.toLowerCase() === 'administrador') {
        document.getElementById('adminBtn').style.display = 'block';
    }
    
    document.getElementById('stopImpersonationBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
    
    switchView('admin');
}
