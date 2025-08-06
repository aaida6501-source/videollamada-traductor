// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD36TwreU7Kv80YmAgR49tNdKxvXT5ZJ68",
    authDomain: "videollamada-traductor.firebaseapp.com",
    projectId: "videollamada-traductor",
    storageBucket: "videollamada-traductor.firebasestorage.app",
    messagingSenderId: "928535952561",
    appId: "1:928535952561:web:01dc51e6c73b155d573690"
};

// Configuración de LibreTranslate
const translatorConfig = {
    endpoint: 'https://translate.fedilab.app/translate'
};

// Variables globales
let app, db, auth;
let localStream, pc, roomId, currentUserId;
let recognition, synthesis, isVoiceTranslationActive = false;
let voiceTranslationEnabled = false;

// Función para mostrar errores
function showError(message) {
    console.error('Error:', message);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f56565;
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 90%;
        text-align: center;
        font-weight: 600;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// Función para mostrar mensajes de éxito
function showSuccess(message) {
    console.log('Éxito:', message);
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #48bb78;
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 90%;
        text-align: center;
        font-weight: 600;
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

// Función para copiar enlace
window.copyRoomLink = async function() {
    console.log('Botón Copiar Enlace clickeado');
    if (!roomId) {
        showError('No hay sala activa para compartir.');
        return;
    }
    const shareLink = `https://wondrous-smakager-75e095.netlify.app?sala=${roomId}`;
    const shareLinkInput = document.getElementById('share-link');
    if (shareLinkInput) {
        shareLinkInput.value = shareLink;
    }
    try {
        await navigator.clipboard.writeText(shareLink);
        showSuccess('Enlace copiado al portapapeles. Compártelo manualmente (WhatsApp, SMS, etc.).');
    } catch (error) {
        console.error('Error al copiar enlace:', error);
        showError('No se pudo copiar el enlace. Cópialo manualmente desde el campo.');
    }
};

// Inicializar Firebase
async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK no se cargó correctamente. Verifica tu conexión a internet.');
        }
        console.log('Firebase SDK detectado, inicializando...');
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
        console.log('Firebase inicializado correctamente');
        await auth.signInAnonymously();
        console.log('Autenticado como:', auth.currentUser.uid);
        currentUserId = auth.currentUser.uid.slice(0, 8);
        return true;
    } catch (error) {
        console.error('Error al inicializar Firebase:', error);
        showError('Error de Firebase: ' + error.message);
        return false;
    }
}

// Configuración STUN para WebRTC
const pcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM cargado, iniciando aplicación...');
    showMessage('Cargando aplicación...', 'system');
    let attempts = 0;
    const maxAttempts = 10;
    while (typeof firebase === 'undefined' && attempts < maxAttempts) {
        console.log(`Esperando Firebase... intento ${attempts + 1}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }
    if (typeof firebase === 'undefined') {
        showError('No se pudo cargar Firebase. Verifica tu conexión a internet y recarga la página.');
        return;
    }
    const firebaseReady = await initializeFirebase();
    if (!firebaseReady) {
        return;
    }
    try {
        console.log('Solicitando permisos de cámara y micrófono...');
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                facingMode: 'user'
            }, 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        const localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.srcObject = localStream;
            console.log('Stream local iniciado correctamente');
            showSuccess('Cámara y micrófono listos');
        } else {
            throw new Error('Elemento local-video no encontrado');
        }
        initializeVoiceRecognition();
        // Verificar si hay un ID de sala en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('sala');
        if (roomFromUrl) {
            document.getElementById('room-id').value = roomFromUrl;
            joinRoom();
        }
    } catch (error) {
        console.error('Error con cámara/micrófono:', error);
        showError('Error al acceder a cámara/micrófono: ' + error.message);
    }
    // Añadir eventos a botones para depuración
    const buttons = ['create-room-btn', 'join-room-btn', 'send-message-btn', 'start-voice-btn', 'stop-voice-btn', 'copy-link-btn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => console.log(`Botón ${id} clickeado`));
        }
    });
});

// Función para mostrar mensajes en el chat
function showMessage(message, type = 'normal') {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Crear sala
window.createRoom = async function() {
    console.log('Botón Crear Sala clickeado');
    const roomIdInput = document.getElementById('room-id');
    if (!roomIdInput || !roomIdInput.value.trim()) {
        showError('Por favor, ingresa un ID de sala');
        return;
    }
    if (!db || !auth.currentUser) {
        showError('Firebase no está listo. Espera un momento e intenta de nuevo.');
        return;
    }
    roomId = roomIdInput.value.trim();
    const roomRef = db.collection('rooms').doc(roomId);
    try {
        showMessage('Creando sala...', 'system');
        const roomSnapshot = await roomRef.get();
        if (roomSnapshot.exists) {
            showError('La sala ya existe. Usa otro ID o únete a ella.');
            return;
        }
        pc = new RTCPeerConnection(pcConfig);
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('Agregando track:', track.kind);
                pc.addTrack(track, localStream);
            });
        }
        pc.ontrack = event => {
            console.log('Stream remoto recibido');
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                showSuccess('Participante conectado');
            }
        };
        pc.onconnectionstatechange = () => {
            console.log('Estado de conexión:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                showSuccess('Videollamada conectada');
            } else if (pc.connectionState === 'disconnected') {
                showError('Conexión perdida');
            }
        };
        const offer = await pc.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true
        });
        await pc.setLocalDescription(offer);
        await roomRef.set({ 
            offer: { type: offer.type, sdp: offer.sdp },
            created: firebase.firestore.FieldValue.serverTimestamp(),
            creator: currentUserId
        });
        console.log('Sala creada:', roomId);
        pc.onicecandidate = async event => {
            if (event.candidate) {
                try {
                    await roomRef.collection('candidates').add(event.candidate.toJSON());
                } catch (error) {
                    console.error('Error al agregar candidato:', error);
                }
            }
        };
        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data && data.answer && !pc.currentRemoteDescription) {
                console.log('Answer recibida, estableciendo descripción remota...');
                const answerDescription = new RTCSessionDescription(data.answer);
                try {
                    await pc.setRemoteDescription(answerDescription);
                    console.log('Descripción remota establecida');
                } catch (error) {
                    console.error('Error al establecer descripción remota:', error);
                }
            }
        });
        roomRef.collection('candidates').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const candidateData = change.doc.data();
                    const candidate = new RTCIceCandidate(candidateData);
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (error) {
                        console.error('Error al agregar candidato ICE:', error);
                    }
                }
            });
        });
        initializeChat(roomId);
        initializeVoiceMessageListener(roomId);
        showMessage(`Sala creada: ${roomId}.`, 'system');
        showSuccess('Sala creada exitosamente');
        // Mostrar enlace para compartir
        const shareLinkContainer = document.getElementById('share-link-container');
        if (shareLinkContainer) {
            shareLinkContainer.style.display = 'flex';
            const shareLinkInput = document.getElementById('share-link');
            if (shareLinkInput) {
                shareLinkInput.value = `https://wondrous-smakager-75e095.netlify.app?sala=${roomId}`;
            }
        }
    } catch (error) {
        console.error('Error al crear sala:', error);
        showError('Error al crear sala: ' + error.message);
    }
};

// Unirse a sala
window.joinRoom = async function() {
    console.log('Botón Unirse a Sala clickeado');
    const roomIdInput = document.getElementById('room-id');
    if (!roomIdInput || !roomIdInput.value.trim()) {
        showError('Por favor, ingresa un ID de sala');
        return;
    }
    if (!db || !auth.currentUser) {
        showError('Firebase no está listo. Espera un momento e intenta de nuevo.');
        return;
    }
    roomId = roomIdInput.value.trim();
    const roomRef = db.collection('rooms').doc(roomId);
    try {
        showMessage('Uniéndose a sala...', 'system');
        const roomSnapshot = await roomRef.get();
        if (!roomSnapshot.exists) {
            showError('La sala no existe. Verifica el ID.');
            return;
        }
        const roomData = roomSnapshot.data();
        if (!roomData.offer) {
            showError('La sala no tiene una oferta válida.');
            return;
        }
        pc = new RTCPeerConnection(pcConfig);
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('Agregando track:', track.kind);
                pc.addTrack(track, localStream);
            });
        }
        pc.ontrack = event => {
            console.log('Stream remoto recibido');
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                showSuccess('Conectado al creador de la sala');
            }
        };
        pc.onconnectionstatechange = () => {
            console.log('Estado de conexión:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                showSuccess('Videollamada conectada');
            } else if (pc.connectionState === 'disconnected') {
                showError('Conexión perdida');
            }
        };
        const offer = roomData.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await roomRef.update({ 
            answer: { type: answer.type, sdp: answer.sdp },
            joined: firebase.firestore.FieldValue.serverTimestamp(),
            joiner: currentUserId
        });
        console.log('Unido a sala:', roomId);
        pc.onicecandidate = async event => {
            if (event.candidate) {
                try {
                    await roomRef.collection('candidates').add(event.candidate.toJSON());
                } catch (error) {
                    console.error('Error al agregar candidato:', error);
                }
            }
        };
        roomRef.collection('candidates').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const candidateData = change.doc.data();
                    const candidate = new RTCIceCandidate(candidateData);
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (error) {
                        console.error('Error al agregar candidato ICE:', error);
                    }
                }
            });
        });
        initializeChat(roomId);
        initializeVoiceMessageListener(roomId);
        showMessage(`Te uniste a la sala: ${roomId}`, 'system');
        showSuccess('Unido a la sala exitosamente');
        // Mostrar enlace para compartir
        const shareLinkContainer = document.getElementById('share-link-container');
        if (shareLinkContainer) {
            shareLinkContainer.style.display = 'flex';
            const shareLinkInput = document.getElementById('share-link');
            if (shareLinkInput) {
                share
