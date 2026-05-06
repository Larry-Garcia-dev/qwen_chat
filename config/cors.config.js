const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:3002',
            process.env.FRONTEND_URL,
            process.env.PUBLIC_URL
        ].filter(Boolean);
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`[CORS] Origen bloqueado: ${origin}`);
            callback(null, true); // En producción deberías cambiar el 'true' por un Error
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = corsOptions;