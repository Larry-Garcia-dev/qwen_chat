require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const qwenRoutes = require('./routes/qwen.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware de Logs Globales
app.use((req, res, next) => {
    console.log(`\n--- [LOG] Petición Entrante ---`);
    console.log(`Método: ${req.method} | Ruta: ${req.url}`);
    console.log(`Cuerpo (Body):`, req.body);
    next();
});

// Rutas
app.use('/api/qwen', qwenRoutes);

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Esperando peticiones...\n`);
});