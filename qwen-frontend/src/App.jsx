import { useState, useRef } from 'react';
import './App.css';

const API_URL = 'http://localhost:3002/api/qwen'; // Asegúrate de que el puerto coincida con tu backend

function App() {
  const [model, setModel] = useState('qwen-turbo');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const addMessage = (text, sender) => {
    setMessages((prev) => [...prev, { text, sender }]);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    addMessage(inputText, 'user');
    const currentText = inputText;
    setInputText('');

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentText, model: model })
      });
      const data = await response.json();
      
      if (data.success) {
        addMessage(data.data, 'bot');
      } else {
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot');
      }
    } catch (error) {
      addMessage(`Error de conexión: ${error.message}`, 'bot');
    }
  };

  const handleGenerateImage = async () => {
    if (!inputText.trim()) return alert("Escribe un prompt en el cuadro de texto.");
    
    addMessage(`Generando imagen para: "${inputText}"...`, 'user');
    
    try {
      const response = await fetch(`${API_URL}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inputText })
      });
      const data = await response.json();
      addMessage("Solicitud enviada (Revisa la consola del backend)", 'bot');
    } catch (error) {
      addMessage(`Error: ${error.message}`, 'bot');
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await sendAudioToServer(audioBlob);
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        alert("Error al acceder al micrófono: " + error.message);
      }
    } else {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioToServer = async (audioBlob) => {
    addMessage("Procesando audio...", 'user');
    const formData = new FormData();
    formData.append('audio', audioBlob, 'grabacion.webm');

    try {
      const response = await fetch(`${API_URL}/audio-stt`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      addMessage(`Audio subido. Servidor responde: ${data.data}`, 'bot');
    } catch (error) {
      addMessage(`Error subiendo audio: ${error.message}`, 'bot');
    }
  };

  // --- ACTUALIZADO PARA ENVIAR ARCHIVO Y PREGUNTA JUNTOS ---
  const handleFileUpload = async () => {
    if (!selectedFile) return alert("Selecciona un archivo primero");

    const promptToSend = inputText || '¿Qué información contiene este archivo?';
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('prompt', promptToSend); 

    addMessage(`Enviando archivo y preguntando: "${promptToSend}"...`, 'user');
    setInputText(''); 

    try {
      const response = await fetch(`${API_URL}/multimodal`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      if (data.success) {
        addMessage(data.data, 'bot');
      } else {
        addMessage(`Error analizando archivo: ${JSON.stringify(data.error)}`, 'bot');
      }
      
      setSelectedFile(null); 
    } catch (error) {
      addMessage(`Error de conexión: ${error.message}`, 'bot');
    }
  };

  return (
    <div className="app-container">
      <div className="panel">
        <h2>Panel de Control Qwen (React)</h2>
        <label>Selecciona el Modelo:</label>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="qwen-turbo">Qwen Turbo (Texto)</option>
          <option value="qwen-max">Qwen Max (Texto Avanzado)</option>
          <option value="qwen-vl-plus">Qwen VL (Visión/Documentos)</option>
          <option value="qwen-audio-turbo">Qwen Audio (Análisis de Voz)</option>
        </select>
      </div>

      <div className="panel">
        <div className="chat-box">
          {messages.map((msg, index) => (
            <div key={index} className={`msg ${msg.sender}`}>
              {msg.text}
            </div>
          ))}
        </div>

        <textarea 
          rows="3" 
          placeholder="Escribe tu mensaje o prompt de imagen..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        
        <div className="controls">
          <button className="btn-primary" onClick={handleSendMessage}>Enviar Texto</button>
          <button className="btn-secondary" onClick={handleGenerateImage}>Crear Imagen</button>
        </div>

        <hr />
        
        <h4>Multimedia y Archivos</h4>
        <input 
          type="file" 
          accept="image/*, audio/*, .pdf" 
          onChange={(e) => setSelectedFile(e.target.files[0])} 
        />
        <div className="controls">
          {/* Este botón ahora envía el archivo + lo que escribas en el textarea */}
          <button className="btn-secondary" onClick={handleFileUpload}>Subir y Analizar Archivo</button>
          <button 
            className={`btn-record ${isRecording ? 'recording' : ''}`} 
            onClick={toggleRecording}
          >
            {isRecording ? "⏹ Detener y Enviar" : "🎤 Grabar Voz"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;