import { useState, useRef, useEffect } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api/qwen';

const MODELS = [
  { id: 'qwen-turbo', name: 'Qwen Turbo', description: 'Rapido y eficiente para texto', icon: '⚡' },
  { id: 'qwen-max', name: 'Qwen Max', description: 'Maximo poder para tareas complejas', icon: '🧠' },
  { id: 'qwen-vl-plus', name: 'Qwen Vision', description: 'Analiza imagenes y documentos', icon: '👁' },
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

  const addMessage = (content, sender, type = 'text') => {
    setMessages((prev) => [...prev, { content, sender, type, timestamp: new Date() }]);
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
      addMessage(`Error de conexion: ${error.message}`, 'bot', 'error');
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

  const handleGenerateImage = async () => {
    if (!inputText.trim()) {
      addMessage('Por favor, escribe una descripcion para la imagen', 'bot', 'error');
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
      addMessage(data.message || "Solicitud de imagen enviada", 'bot');
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
        addMessage("Error al acceder al microfono: " + error.message, 'bot', 'error');
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
      addMessage(`Error de conexion: ${error.message}`, 'bot', 'error');
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

  // Drag and Drop handlers
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
        {/* Header */}
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

        {/* Mobile Model Selector */}
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

        {/* Chat Messages */}
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
                <p>Suelta el archivo aqui</p>
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="empty-chat">
              <img src="/logo.png" alt="Macondo" className="empty-logo" />
              <h2>Bienvenido a Macondo Chat</h2>
              <p>Escribe un mensaje, sube un archivo o graba audio para comenzar</p>
              <div className="quick-actions">
                <button onClick={() => setInputText('Explicame que puedes hacer')}>
                  Que puedes hacer?
                </button>
                <button onClick={() => setInputText('Ayudame a analizar un documento')}>
                  Analizar documento
                </button>
                <button onClick={() => setInputText('Genera una idea creativa')}>
                  Idea creativa
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.sender} ${msg.type === 'error' ? 'error' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {msg.sender === 'bot' && (
                  <div className="message-avatar bot-avatar">
                    <img src="/logo.png" alt="Bot" />
                  </div>
                )}
                <div className="message-content">
                  {msg.type === 'file' && (
                    <div className="message-file-badge">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      Archivo adjunto
                    </div>
                  )}
                  {msg.type === 'audio' && (
                    <div className="message-file-badge audio">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                      Audio
                    </div>
                  )}
                  {msg.type === 'url' && (
                    <div className="message-file-badge url">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                      URL
                    </div>
                  )}
                  <p>{msg.content}</p>
                  <span className="message-time">
                    {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {msg.sender === 'user' && (
                  <div className="message-avatar user-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                )}
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
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="input-area">
          {/* File Preview */}
          {selectedFile && (
            <div className="file-preview">
              <div className="file-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>{selectedFile.name}</span>
                <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button className="remove-file" onClick={removeFile}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* URL Input */}
          {showUrlInput && (
            <div className="url-input-container">
              <input
                type="url"
                placeholder="Pega una URL aqui..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleUrlSubmit()}
              />
              <button className="url-submit" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
              <button className="url-cancel" onClick={() => { setShowUrlInput(false); setUrlInput(''); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          <div className="input-row">
            {/* Action Buttons */}
            <div className="action-buttons">
              <button 
                className="action-btn" 
                onClick={() => fileInputRef.current?.click()}
                title="Subir archivo"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*, audio/*, .pdf, .doc, .docx, .txt"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                style={{ display: 'none' }}
              />
              
              <button 
                className="action-btn"
                onClick={() => setShowUrlInput(!showUrlInput)}
                title="Agregar URL"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </button>

              <button 
                className={`action-btn record-btn ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                title={isRecording ? 'Detener grabacion' : 'Grabar audio'}
              >
                {isRecording ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
            </div>

            {/* Text Input */}
            <div className="text-input-container">
              <textarea
                placeholder="Escribe tu mensaje..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                rows="1"
              />
            </div>

            {/* Send Buttons */}
            <div className="send-buttons">
              <button 
                className="send-btn primary"
                onClick={handleSendMessage}
                disabled={isLoading || (!inputText.trim() && !selectedFile)}
                title="Enviar mensaje"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
              <button 
                className="send-btn secondary"
                onClick={handleGenerateImage}
                disabled={isLoading || !inputText.trim()}
                title="Generar imagen"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
