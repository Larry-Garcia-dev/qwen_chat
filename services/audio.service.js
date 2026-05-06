const axios = require('axios');
const fs = require('fs');
const path = require('path');
const apiUtils = require('../utils/api.util');

class AudioService {
    static async textToSpeech(text) {
        console.log(`\n[API REQUEST] Text to Speech (CosyVoice v3 WebSocket)`);
        console.log(`[TEXT] ${text.substring(0, 100)}...`);
        
        if (!text || typeof text !== 'string') {
            throw new Error('El texto es requerido para TTS');
        }

        const WebSocket = require('ws');
        const { v4: uuidv4 } = require('uuid');
        
        return new Promise((resolve, reject) => {
            const taskId = uuidv4().replace(/-/g, '');
            const audioChunks = [];
            let isTaskStarted = false;
            
            const wsUrl = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference';
            
            console.log(`[TTS] Conectando a WebSocket...`);
            
            const ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
                }
            });
            
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Timeout: TTS tardó demasiado'));
            }, 60000);
            
            ws.on('open', () => {
                const runTask = {
                    header: { action: "run-task", task_id: taskId, streaming: "duplex" },
                    payload: {
                        task_group: "audio", task: "tts", function: "SpeechSynthesizer", model: "cosyvoice-v3-flash",
                        parameters: { text_type: "PlainText", voice: "longanyang", format: "mp3", sample_rate: 22050, volume: 50, rate: 1, pitch: 1 },
                        input: {}
                    }
                };
                ws.send(JSON.stringify(runTask));
            });
            
            ws.on('message', (data) => {
                const dataStr = data.toString();
                try {
                    const event = JSON.parse(dataStr);
                    const action = event.header?.action;
                    const code = event.header?.code;
                    
                    if (code && code !== 'Success' && code !== 0) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error(`TTS Error: ${event.header?.message || code}`));
                        return;
                    }
                    
                    if (action === 'task-started') {
                        isTaskStarted = true;
                        const continueTask = { header: { action: "continue-task", task_id: taskId, streaming: "duplex" }, payload: { input: { text: text } } };
                        ws.send(JSON.stringify(continueTask));
                        
                        const finishTask = { header: { action: "finish-task", task_id: taskId, streaming: "duplex" }, payload: { input: {} } };
                        ws.send(JSON.stringify(finishTask));
                    }
                    
                    if (event.payload?.output?.audio) {
                        const audioBuffer = Buffer.from(event.payload.output.audio, 'base64');
                        audioChunks.push(audioBuffer);
                    }
                    
                    if (action === 'task-finished') {
                        clearTimeout(timeout);
                        ws.close();
                        if (audioChunks.length > 0) {
                            const audioBuffer = Buffer.concat(audioChunks);
                            const localFileName = `tts_${Date.now()}.mp3`;
                            const filePath = path.join(process.cwd(), 'uploads', 'audio', localFileName);
                            fs.writeFileSync(filePath, audioBuffer);
                            resolve(apiUtils.getPublicUrl(localFileName, 'audio'));
                        } else {
                            reject(new Error('No se recibió audio'));
                        }
                    }
                    
                    if (action === 'task-failed') {
                        const errorMsg = event.header?.message || event.payload?.message || 'Error desconocido';
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error(`TTS fallido: ${errorMsg}`));
                    }
                    
                } catch (e) {
                    if (Buffer.isBuffer(data) && data.length > 200) {
                        audioChunks.push(data);
                    }
                }
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Error WebSocket TTS: ${error.message}`));
            });
            
            ws.on('close', () => {
                clearTimeout(timeout);
                if (audioChunks.length > 0) {
                    const audioBuffer = Buffer.concat(audioChunks);
                    if (audioBuffer.length > 1000) {
                        const localFileName = `tts_${Date.now()}.mp3`;
                        const filePath = path.join(process.cwd(), 'uploads', 'audio', localFileName);
                        fs.writeFileSync(filePath, audioBuffer);
                        resolve(apiUtils.getPublicUrl(localFileName, 'audio'));
                        return;
                    }
                }
                reject(new Error('WebSocket cerrado sin recibir audio completo'));
            });
        });
    }

    static async audioToText(fileName, prompt = '') {
        console.log(`\n[API REQUEST] Audio to Text (Fun-ASR)`);
        
        if (!fileName) throw new Error('Se requiere un archivo de audio');

        const fileUrl = apiUtils.getPublicUrl(fileName, 'audio');
        
        const payload = {
            model: "fun-asr",
            input: { file_urls: [fileUrl] },
            parameters: { language_hints: ["es", "en", "zh"] }
        };

        try {
            const createRes = await axios.post(
                `https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription`,
                payload,
                { headers: apiUtils.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            if (!taskId) throw new Error('No se pudo crear la tarea de transcripción');

            let attempts = 0;
            const maxAttempts = 30;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 3000));
                attempts++;
                
                const checkRes = await axios.get(
                    `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`,
                    { headers: apiUtils.getHeaders(), timeout: 30000 }
                );
                
                const status = checkRes.data?.output?.task_status;
                
                if (status === 'SUCCEEDED') {
                    const results = checkRes.data?.output?.results;
                    if (results && results.length > 0) {
                        const transcription = results[0]?.transcription_url;
                        if (transcription) {
                            const transRes = await axios.get(transcription);
                            return transRes.data?.transcripts?.[0]?.text || transRes.data?.text || JSON.stringify(transRes.data);
                        }
                        return results[0]?.text || JSON.stringify(results);
                    }
                    throw new Error('Transcripción vacía');
                }
                
                if (status === 'FAILED') throw new Error('Transcripción fallida');
            }
            throw new Error('Timeout en transcripción');
        } catch (error) {
            console.error(`[ERROR] STT: ${error.message}`);
            throw new Error(`Error en transcripción: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}

module.exports = AudioService;