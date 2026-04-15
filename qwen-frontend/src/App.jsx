import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = 'http://47.87.38.80:3000/api/qwen';
// Modos de operación disponibles
const MODES = [
  { id: 'chat', name: 'Chat', description: 'Conversacion inteligente', icon: 'chat' },
  { id: 'image', name: 'Imagen', description: 'Genera imagenes desde texto', icon: 'image' },
  { id: 'video', name: 'Video', description: 'Genera video (T2V/I2V)', icon: 'video' },
  { id: 'tts', name: 'Texto a Voz', description: 'Convierte texto a audio', icon: 'audio' },
  { id: 'stt', name: 'Voz a Texto', description: 'Transcribe audio', icon: 'mic' },
  { id: 'vision', name: 'Vision', description: 'Analiza imagenes/documentos', icon: 'eye' },
];

// Componente de icono SVG
const Icon = ({ name, size = 24 }) => {
  const icons = {
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    video: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>,
    audio: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></>,
    mic: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
};

function App() {
  const [mode, setMode] = useState('chat');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showModeSelector, setShowModeSelector] = useState(false);
  
  // Estado para memoria de contexto
  const [conversationHistory, setConversationHistory] = useState([]);
  const [documentContext, setDocumentContext] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll al final del chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Agregar mensaje al historial
  const addMessage = useCallback((content, sender, type = 'text', mediaType = null) => {
    setMessages((prev) => [...prev, {
      id: Date.now(),
      content,
      sender,
      type,
      mediaType,
      timestamp: new Date()
    }]);
  }, []);

  // Detectar tipo de media desde URL
  const detectMediaType = (url) => {
    if (!url || typeof url !== 'string') return null;
    const lower = url.toLowerCase();
    if (lower.match(/\.(mp4|webm|mov|avi)($|\?)/)) return 'video';
    if (lower.match(/\.(mp3|wav|ogg|m4a|flac)($|\?)/)) return 'audio';
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)($|\?)/)) return 'image';
    // Si es una URL pero no tiene extension clara, intentar por el path
    if (lower.includes('/video/') || lower.includes('video_')) return 'video';
    if (lower.includes('/audio/') || lower.includes('tts_')) return 'audio';
    if (lower.includes('/image') || lower.includes('image_')) return 'image';
    return null;
  };

  // Handler principal para enviar mensajes
  const handleSendMessage = async () => {
    if (isLoading) return;
    
    const text = inputText.trim();
    const file = selectedFile;
    
    // Validaciones segun el modo
    if (mode === 'chat' && !text) return;
    if (mode === 'image' && !text) {
      addMessage('Por favor, escribe una descripcion para la imagen', 'bot', 'error');
      return;
    }
    if (mode === 'video' && !text && !file) {
      addMessage('Escribe un prompt o sube una imagen para generar video', 'bot', 'error');
      return;
    }
    if (mode === 'tts' && !text) {
      addMessage('Escribe el texto que deseas convertir a voz', 'bot', 'error');
      return;
    }
    if (mode === 'stt' && !file) {
      addMessage('Sube un archivo de audio para transcribir', 'bot', 'error');
      return;
    }
    if (mode === 'vision' && !file) {
      addMessage('Sube una imagen o documento para analizar', 'bot', 'error');
      return;
    }

    // Mostrar mensaje del usuario
    const userMsg = file 
      ? `${file.name}${text ? ` - "${text}"` : ''}` 
      : text;
    addMessage(userMsg, 'user', file ? 'file' : 'text');
    
    setInputText('');
    setSelectedFile(null);
    setIsLoading(true);

    try {
      let response;
      let endpoint;
      let body;

      switch (mode) {
        case 'chat':
          endpoint = '/chat';
          body = JSON.stringify({ 
            prompt: text,
            conversationHistory: conversationHistory,
            documentContext: documentContext
          });
          response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          });
          break;

        case 'image':
          endpoint = '/generate-image';
          body = JSON.stringify({ prompt: text });
          response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          });
          break;

        case 'video':
          endpoint = '/generate-video';
          const videoFormData = new FormData();
          if (file) videoFormData.append('file', file);
          videoFormData.append('prompt', text || 'Create a cinematic video');
          response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            body: videoFormData
          });
          break;

        case 'tts':
          endpoint = '/tts';
          body = JSON.stringify({ prompt: text });
          response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          });
          break;

        case 'stt':
          endpoint = '/audio-stt';
          const sttFormData = new FormData();
          sttFormData.append('file', file);
          if (text) sttFormData.append('prompt', text);
          response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            body: sttFormData
          });
          break;

        case 'vision':
          endpoint = '/multimodal';
          const visionFormData = new FormData();
          visionFormData.append('file', file);
          visionFormData.append('prompt', text || 'Describe esta imagen en detalle');
          response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            body: visionFormData
          });
          break;

        default:
          throw new Error('Modo no soportado');
      }

      const data = await response.json();
      
      if (data.success) {
        const mediaType = detectMediaType(data.data);
        addMessage(data.data, 'bot', mediaType ? 'media' : 'text', mediaType);
        
        // Actualizar historial de conversacion solo para chat
        if (mode === 'chat') {
          setConversationHistory(prev => [
            ...prev,
            { role: 'user', content: text },
            { role: 'assistant', content: data.data }
          ]);
        }
        
        // Si es analisis de documento (vision), guardar el contexto con el contenido extraido
        if (mode === 'vision' && data.analysisType === 'document' && file) {
          // Guardamos el contenido extraido del documento para memoria
          const docContent = data.documentContent || data.data;
          setDocumentContext({
            fileName: file.name,
            content: docContent,
            analysis: data.data, // El analisis inicial
            timestamp: new Date().toISOString()
          });
          addMessage('El documento ha sido cargado en la memoria. Puedes hacerme preguntas sobre su contenido en el modo Chat.', 'bot', 'info');
        }
      } else {
        addMessage(`Error: ${data.error || 'Error desconocido'}`, 'bot', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      addMessage(`Error de conexion: ${error.message}`, 'bot', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar Enter para enviar
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Grabacion de audio
  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        // Verificar si mediaDevices esta disponible (requiere HTTPS o localhost)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          // Intentar fallback para navegadores antiguos
          const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
          if (!getUserMedia) {
            throw new Error('Tu navegador no soporta grabacion de audio. Intenta usar HTTPS o un navegador moderno.');
          }
          // Usar el fallback
          getUserMedia.call(navigator, { audio: true },
            (stream) => startRecordingWithStream(stream),
            (error) => { throw error; }
          );
          return;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startRecordingWithStream(stream);
      } catch (error) {
        let errorMsg = error.message;
        if (error.name === 'NotAllowedError') {
          errorMsg = 'Permiso de microfono denegado. Por favor permite el acceso al microfono.';
        } else if (error.name === 'NotFoundError') {
          errorMsg = 'No se encontro un microfono. Por favor conecta un microfono.';
        } else if (error.name === 'NotSupportedError' || !navigator.mediaDevices) {
          errorMsg = 'La grabacion de audio requiere HTTPS. Accede desde https:// o localhost.';
        }
        addMessage(`Error al acceder al microfono: ${errorMsg}`, 'bot', 'error');
      }
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

  // Funcion auxiliar para iniciar grabacion con un stream
  const startRecordingWithStream = (stream) => {
    // Detectar el mejor mimeType soportado
    const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    let selectedMimeType = '';
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }
    
    const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
    mediaRecorderRef.current = new MediaRecorder(stream, options);
    audioChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType || 'audio/webm' });
      const ext = selectedMimeType?.split('/')[1] || 'webm';
      const audioFile = new File([audioBlob], `recording_${Date.now()}.${ext}`, { type: audioBlob.type });
      setSelectedFile(audioFile);
      setMode('stt'); // Cambiar a modo STT automaticamente
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorderRef.current.start();
    setIsRecording(true);
  };

  // Drag and drop handlers
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
      handleFileSelect(files[0]);
    }
  };

  // Seleccion de archivo
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    // Auto-detectar modo basado en el tipo de archivo
    const type = file.type;
    if (type.startsWith('audio/')) {
      setMode('stt');
    } else if (type.startsWith('image/') || type.startsWith('video/')) {
      // Podria ser vision o video (I2V)
      if (!['video', 'vision'].includes(mode)) {
        setMode('vision');
      }
    } else {
      setMode('vision'); // Documentos
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Renderizar contenido de mensaje
  const renderMessageContent = (msg) => {
    if (msg.type === 'error') {
      return <p className="error-text">{msg.content}</p>;
    }

    if (msg.type === 'media' && msg.mediaType) {
      switch (msg.mediaType) {
        case 'video':
          return (
            <div className="media-container">
              <video src={msg.content} controls playsInline className="media-video" />
              <a href={msg.content} download className="download-link" target="_blank" rel="noopener noreferrer">
                <Icon name="download" size={16} /> Descargar video
              </a>
            </div>
          );
        case 'audio':
          return (
            <div className="media-container">
              <audio src={msg.content} controls className="media-audio" />
              <a href={msg.content} download className="download-link" target="_blank" rel="noopener noreferrer">
                <Icon name="download" size={16} /> Descargar audio
              </a>
            </div>
          );
        case 'image':
          return (
            <div className="media-container">
              <img src={msg.content} alt="Imagen generada" className="media-image" loading="lazy" />
              <a href={msg.content} download className="download-link" target="_blank" rel="noopener noreferrer">
                <Icon name="download" size={16} /> Descargar imagen
              </a>
            </div>
          );
        default:
          return <p>{msg.content}</p>;
      }
    }

    // Texto normal con formato
    return <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>;
  };

  const currentMode = MODES.find(m => m.id === mode);

  // Helper para obtener placeholder segun modo
  const getPlaceholder = () => {
    switch (mode) {
      case 'chat': return 'Escribe tu mensaje...';
      case 'image': return 'Describe la imagen que quieres generar...';
      case 'video': return 'Describe el video o sube una imagen base...';
      case 'tts': return 'Escribe el texto para convertir a voz...';
      case 'stt': return 'Sube un audio o graba con el microfono...';
      case 'vision': return 'Pregunta sobre la imagen o documento...';
      default: return 'Escribe algo...';
    }
  };

  // Determinar si el boton de enviar debe estar activo
  const canSend = () => {
    if (isLoading) return false;
    const text = inputText.trim();
    switch (mode) {
      case 'chat':
      case 'image':
      case 'tts':
        return text.length > 0;
      case 'video':
        return text.length > 0 || selectedFile;
      case 'stt':
      case 'vision':
        return selectedFile !== null;
      default:
        return false;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-container">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-IuY2TUKQoH0RiIh35CCr4lfTCSDl0j.png" alt="HDI Seguros" className="logo" />
        </div>
        
        <div className="mode-section">
          <h3>Modo de Operacion</h3>
          <div className="mode-cards">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`mode-card ${mode === m.id ? 'active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                <span className="mode-icon">
                  <Icon name={m.icon} size={20} />
                </span>
                <div className="mode-info">
                  <span className="mode-name">{m.name}</span>
                  <span className="mode-desc">{m.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <p>Powered by Qwen AI</p>
          <p className="api-status">API: {API_URL.replace('/api/qwen', '')}</p>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          <div className="header-info">
            <img 
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-IuY2TUKQoH0RiIh35CCr4lfTCSDl0j.png" 
              alt="HDI Seguros" 
              className="header-logo"
            />
            <span className="current-mode">
              <Icon name={currentMode?.icon} size={16} />
              {currentMode?.name}
            </span>
          </div>
          <div className="header-actions">
            {/* Indicador de contexto activo */}
            {(documentContext || conversationHistory.length > 0) && (
              <div className="context-indicator">
                {documentContext && (
                  <span className="context-badge document" title={`Documento: ${documentContext.fileName}`}>
                    Doc: {documentContext.fileName.substring(0, 15)}...
                  </span>
                )}
                {conversationHistory.length > 0 && (
                  <span className="context-badge history" title={`${conversationHistory.length} mensajes en memoria`}>
                    Memoria: {conversationHistory.length} msgs
                  </span>
                )}
                <button 
                  className="clear-context-btn"
                  onClick={() => {
                    setConversationHistory([]);
                    setDocumentContext(null);
                    addMessage('Memoria limpiada. El contexto anterior ha sido eliminado.', 'bot', 'info');
                  }}
                  title="Limpiar memoria"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            )}
            <button 
              className="mobile-mode-btn"
              onClick={() => setShowModeSelector(!showModeSelector)}
              aria-label="Seleccionar modo"
            >
              <Icon name="settings" size={24} />
            </button>
          </div>
        </header>

        {/* Mobile mode selector */}
        {showModeSelector && (
          <div className="mobile-mode-selector">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`mobile-mode-option ${mode === m.id ? 'active' : ''}`}
                onClick={() => {
                  setMode(m.id);
                  setShowModeSelector(false);
                }}
              >
                <Icon name={m.icon} size={16} />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Chat messages area */}
        <div 
          className={`chat-messages ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="drop-overlay">
              <div className="drop-content">
                <Icon name="upload" size={48} />
                <p>Suelta el archivo aqui</p>
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="empty-chat">
              <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-IuY2TUKQoH0RiIh35CCr4lfTCSDl0j.png" alt="HDI Seguros" className="empty-logo" />
              <h2>Bienvenido a HDI Chat</h2>
              <p>Selecciona un modo y comienza a crear</p>
              <div className="quick-actions">
                {MODES.slice(0, 4).map((m) => (
                  <button key={m.id} onClick={() => setMode(m.id)}>
                    <Icon name={m.icon} size={16} />
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`message ${msg.sender} ${msg.type === 'error' ? 'error' : ''}`}
              >
                {msg.sender === 'bot' && (
                  <div className="message-avatar bot-avatar">
                    <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-IuY2TUKQoH0RiIh35CCr4lfTCSDl0j.png" alt="HDI Bot" />
                  </div>
                )}
                <div className="message-content">
                  {renderMessageContent(msg)}
                  <span className="message-time">
                    {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="message bot loading">
              <div className="message-avatar bot-avatar">
                <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-IuY2TUKQoH0RiIh35CCr4lfTCSDl0j.png" alt="HDI Bot" />
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
                <span className="loading-text">
                  {mode === 'video' ? 'Generando video (puede tardar 1-2 min)...' : 
                   mode === 'image' ? 'Generando imagen...' :
                   mode === 'tts' ? 'Convirtiendo a voz...' :
                   mode === 'stt' ? 'Transcribiendo audio...' :
                   'Procesando...'}
                </span>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="input-area">
          {/* File preview */}
          {selectedFile && (
            <div className="file-preview">
              <div className="file-info">
                <Icon name="upload" size={16} />
                <span className="file-name">{selectedFile.name}</span>
                <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button className="remove-file" onClick={removeFile} aria-label="Eliminar archivo">
                <Icon name="x" size={16} />
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="input-row">
            {/* Action buttons */}
            <div className="action-buttons">
              <button 
                className="action-btn" 
                onClick={() => fileInputRef.current?.click()} 
                title="Subir archivo"
                disabled={isLoading}
              >
                <Icon name="upload" size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <button 
                className={`action-btn record-btn ${isRecording ? 'recording' : ''}`} 
                onClick={toggleRecording} 
                title={isRecording ? 'Detener grabacion' : 'Grabar audio'}
                disabled={isLoading}
              >
                <Icon name={isRecording ? 'stop' : 'mic'} size={20} />
              </button>
            </div>

            {/* Text input */}
            <div className="text-input-container">
              <textarea
                placeholder={getPlaceholder()}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                rows="1"
                disabled={isLoading}
              />
            </div>

            {/* Send button */}
            <button 
              className="send-btn primary" 
              onClick={handleSendMessage} 
              disabled={!canSend()}
              title="Enviar"
            >
              <Icon name="send" size={20} />
            </button>
          </div>

          {/* Mode hint */}
          <div className="mode-hint">
            Modo: <strong>{currentMode?.name}</strong> - {currentMode?.description}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
