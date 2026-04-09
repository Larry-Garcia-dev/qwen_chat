import { useState, useRef, useEffect } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/qwen';

const MODELS = [
  { id: 'qwen-turbo', name: 'Qwen Turbo', description: 'Rápido y eficiente para texto', icon: '⚡' },
  { id: 'qwen-max', name: 'Qwen Max', description: 'Máximo poder para tareas complejas', icon: '🧠' },
  { id: 'qwen-vl-plus', name: 'Qwen Vision', description: 'Analiza imágenes y documentos', icon: '👁' },
  { id: 'qwen-audio-turbo', name: 'Qwen Audio', description: 'Procesa y analiza audio', icon: '🎵' },
];

function App() {
  const [model, setModel] = useState('qwen-turbo');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ACTUALIZACIÓN 1: Agregado el parámetro `isMedia` para saber si es texto o archivo multimedia
  const addMessage = (content, sender, type = 'text', isMedia = false) => {
    setMessages((prev) => [...prev, { content, sender, type, isMedia, timestamp: new Date() }]);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() && !selectedFile) return;
    
    if (selectedFile) {
      await handleFileUpload();
      return;
    }

    addMessage(inputText, 'user');
    const currentText = inputText;
    setInputText('');
    setIsLoading(true);

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
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot', 'error');
      }
    } catch (error) {
      addMessage(`Error de conexión: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ACTUALIZACIÓN 2: Lógica adaptada para recibir y mostrar la URL de la imagen
  const handleGenerateImage = async () => {
    if (!inputText.trim()) {
      addMessage('Por favor, escribe una descripción para la imagen', 'bot', 'error');
      return;
    }
    
    addMessage(`Generando imagen: "${inputText}"`, 'user');
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inputText })
      });
      const data = await response.json();
      
      if (data.success) {
        const isUrl = typeof data.data === 'string' && data.data.startsWith('http');
        addMessage(data.data, 'bot', 'text', isUrl);
      } else {
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot', 'error');
      }
    } catch (error) {
      addMessage(`Error: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
      setInputText('');
    }
  };

  // ACTUALIZACIÓN 3: Nueva función para Generación de Video (Wan 2.6)
  const handleGenerateVideo = async () => {
    if (!inputText.trim() && !selectedFile) {
      addMessage('Por favor, escribe un prompt o sube una imagen base para el video', 'bot', 'error');
      return;
    }

    addMessage(`Generando video (Wan 2.6)... Esto puede tardar 1-2 minutos.`, 'user');
    setIsLoading(true);

    const formData = new FormData();
    if (selectedFile) formData.append('file', selectedFile);
    formData.append('prompt', inputText);

    try {
      const response = await fetch(`${API_URL}/generate-video`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      if (data.success) {
        addMessage(data.data, 'bot', 'text', true); // Se asume que retorna URL
      } else {
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot', 'error');
      }
    } catch (error) {
      addMessage(`Error: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
      setInputText('');
      setSelectedFile(null);
    }
  };

  // ACTUALIZACIÓN 4: Nueva función para Text-To-Speech
  const handleTTS = async () => {
    if (!inputText.trim()) {
      addMessage('Escribe el texto que deseas convertir a voz', 'bot', 'error');
      return;
    }

    addMessage(`Convirtiendo a voz: "${inputText}"`, 'user');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inputText })
      });
      const data = await response.json();
      
      if (data.success) {
        // Ajustamos la estructura según la API de Alibaba
        const audioUrl = data.data?.output?.results?.[0]?.audio_url || data.data?.output?.url || JSON.stringify(data.data);
        const isUrl = typeof audioUrl === 'string' && audioUrl.startsWith('http');
        addMessage(audioUrl, 'bot', 'text', isUrl);
      } else {
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot', 'error');
      }
    } catch (error) {
      addMessage(`Error: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
      setInputText('');
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
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        addMessage("Error al acceder al micrófono: " + error.message, 'bot', 'error');
      }
    } else {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioToServer = async (audioBlob) => {
    addMessage("Procesando audio...", 'user', 'audio');
    setIsLoading(true);
    const formData = new FormData();
    formData.append('audio', audioBlob, 'grabacion.webm');

    try {
      const response = await fetch(`${API_URL}/audio-stt`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      addMessage(data.data || "Audio procesado correctamente", 'bot');
    } catch (error) {
      addMessage(`Error subiendo audio: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    const promptToSend = inputText || 'Analiza este archivo en detalle';
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('prompt', promptToSend);

    addMessage(`Archivo: ${selectedFile.name}${inputText ? ` - "${inputText}"` : ''}`, 'user', 'file');
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/multimodal`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      if (data.success) {
        addMessage(data.data, 'bot');
      } else {
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot', 'error');
      }
    } catch (error) {
      addMessage(`Error de conexión: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
      setSelectedFile(null);
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    
    addMessage(`URL: ${urlInput}`, 'user', 'url');
    const promptToSend = inputText || 'Analiza el contenido de esta URL';
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: `${promptToSend}\n\nURL a analizar: ${urlInput}`, 
          model: model 
        })
      });
      const data = await response.json();
      
      if (data.success) {
        addMessage(data.data, 'bot');
      } else {
        addMessage(`Error: ${JSON.stringify(data.error)}`, 'bot', 'error');
      }
    } catch (error) {
      addMessage(`Error: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
      setUrlInput('');
      setShowUrlInput(false);
      setInputText('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const currentModel = MODELS.find(m => m.id === model);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-container">
          <img src="/logo.png" alt="Macondo Magic Softwares" className="logo" />
        </div>
        
        <div className="model-section">
          <h3>Modelo AI</h3>
          <div className="model-cards">
            {MODELS.map((m) => (
              <button
                key={m.id}
                className={`model-card ${model === m.id ? 'active' : ''}`}
                onClick={() => setModel(m.id)}
              >
                <span className="model-icon">{m.icon}</span>
                <div className="model-info">
                  <span className="model-name">{m.name}</span>
                  <span className="model-desc">{m.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <p>Powered by Qwen AI</p>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          <div className="header-info">
            <h1>Macondo Chat</h1>
            <span className="current-model">
              {currentModel?.icon} {currentModel?.name}
            </span>
          </div>
          <button 
            className="mobile-model-btn"
            onClick={() => setShowModelSelector(!showModelSelector)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </header>

        {showModelSelector && (
          <div className="mobile-model-selector">
            {MODELS.map((m) => (
              <button
                key={m.id}
                className={`mobile-model-option ${model === m.id ? 'active' : ''}`}
                onClick={() => {
                  setModel(m.id);
                  setShowModelSelector(false);
                }}
              >
                <span>{m.icon}</span>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        )}

        <div 
          className={`chat-messages ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="drop-overlay">
              <div className="drop-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p>Suelta el archivo aquí</p>
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="empty-chat">
              <img src="/logo.png" alt="Macondo" className="empty-logo" />
              <h2>Bienvenido a Macondo Chat</h2>
              <p>Escribe un mensaje, sube un archivo o graba audio para comenzar</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.sender} ${msg.type === 'error' ? 'error' : ''}`}
              >
                {msg.sender === 'bot' && (
                  <div className="message-avatar bot-avatar">
                    <img src="/logo.png" alt="Bot" />
                  </div>
                )}
                <div className="message-content">
                  {/* ACTUALIZACIÓN 5: Lógica de renderizado Visual de Medios (Videos, Audios e Imágenes) */}
                  {msg.isMedia && typeof msg.content === 'string' ? (
                      msg.content.match(/\.(mp4|webm|mov)$/i) ? (
                        <video src={msg.content} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
                      ) : msg.content.match(/\.(mp3|wav|ogg)$/i) ? (
                        <audio src={msg.content} controls style={{ maxWidth: '100%' }} />
                      ) : (
                        <img src={msg.content} alt="Media generada" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                      )
                  ) : (
                      <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                  )}
                  
                  <span className="message-time">
                    {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="message bot loading">
              <div className="message-avatar bot-avatar">
                <img src="/logo.png" alt="Bot" />
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          {selectedFile && (
            <div className="file-preview">
              <div className="file-info">
                <span>{selectedFile.name}</span>
                <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button className="remove-file" onClick={removeFile}>X</button>
            </div>
          )}

          <div className="input-row">
            <div className="action-buttons">
              <button className="action-btn" onClick={() => fileInputRef.current?.click()} title="Subir archivo">
                📁
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*, audio/*, .pdf, .doc, .docx, .txt"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <button className={`action-btn record-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} title="Grabar audio">
                {isRecording ? "⏹" : "🎤"}
              </button>
            </div>

            <div className="text-input-container">
              <textarea
                placeholder="Escribe tu mensaje o prompt..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                rows="1"
              />
            </div>

            {/* ACTUALIZACIÓN 6: Agregados los botones de enviar para Imagen, Video y Voz */}
            <div className="send-buttons" style={{ display: 'flex', gap: '5px' }}>
              <button className="send-btn primary" onClick={handleSendMessage} disabled={isLoading || (!inputText.trim() && !selectedFile)} title="Enviar Chat/Análisis">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
              
              <button className="send-btn secondary" onClick={handleGenerateImage} disabled={isLoading || !inputText.trim()} title="Generar Imagen">
                🖼️
              </button>

              <button className="send-btn secondary" onClick={handleGenerateVideo} disabled={isLoading || (!inputText.trim() && !selectedFile)} title="Generar Video (T2V/I2V)">
                🎬
              </button>

              <button className="send-btn secondary" onClick={handleTTS} disabled={isLoading || !inputText.trim()} title="Texto a Voz (TTS)">
                🗣️
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;