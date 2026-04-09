let mediaRecorder;
let audioChunks = [];
let isRecording = false;

function addMessage(text, sender) {
    const chatBox = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('user-input').value;
    const model = document.getElementById('model-select').value;
    if (!input) return;

    addMessage(input, 'user');
    document.getElementById('user-input').value = '';

    const res = await fetch('/api/qwen/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input, model: model })
    });
    const data = await res.json();
    if(data.success) addMessage(data.data, 'bot');
    else addMessage("Error: " + JSON.stringify(data.error), 'bot');
}

async function generateImage() {
    const input = document.getElementById('user-input').value;
    if (!input) return alert("Escribe un prompt para la imagen en el cuadro de texto");
    
    addMessage(`Generando imagen para: "${input}"...`, 'user');
    const res = await fetch('/api/qwen/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input })
    });
    const data = await res.json();
    addMessage("Solicitud de imagen enviada. Revisa consola.", 'bot');
    console.log(data);
}

// Lógica de grabación de voz
async function toggleRecording() {
    const btn = document.getElementById('btn-record');
    
    if (!isRecording) {
        // Iniciar grabación
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            await sendAudioToServer(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        btn.innerText = "⏹ Detener y Enviar";
        btn.style.background = "#28a745";
    } else {
        // Detener grabación
        mediaRecorder.stop();
        isRecording = false;
        btn.innerText = "🎤 Grabar Voz";
        btn.style.background = "#dc3545";
    }
}

async function sendAudioToServer(audioBlob) {
    addMessage("Procesando audio...", 'user');
    const formData = new FormData();
    // Nombrar el archivo con extensión
    formData.append('audio', audioBlob, 'grabacion.webm'); 

    const res = await fetch('/api/qwen/audio-stt', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    addMessage(`Audio subido: ${data.data}`, 'bot');
}

async function uploadFile() {
    const fileInput = document.getElementById('file-upload');
    if (!fileInput.files[0]) return alert("Selecciona un archivo");

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    addMessage("Subiendo archivo...", 'user');
    const res = await fetch('/api/qwen/multimodal', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    addMessage(`Archivo subido correctamente: ${data.file}`, 'bot');
}