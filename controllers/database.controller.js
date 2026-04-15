/**
 * Controlador de Base de Datos
 * Endpoints para consultas y cotizaciones
 */

const DatabaseService = require('../services/database.service');

// Wrapper para async/await
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/qwen/db/status
 * Obtiene el estado de la conexión a la BD
 */
exports.getStatus = asyncHandler(async (req, res) => {
    const isConnected = DatabaseService.isDBConnected();
    
    if (!isConnected) {
        return res.json({
            success: true,
            connected: false,
            message: 'Base de datos no conectada'
        });
    }
    
    try {
        const schema = await DatabaseService.getSchemaInfo();
        res.json({
            success: true,
            connected: true,
            tables: schema.map(t => t.table),
            tableCount: schema.length
        });
    } catch (error) {
        res.json({
            success: false,
            connected: false,
            error: error.message
        });
    }
});

/**
 * GET /api/qwen/db/schema
 * Obtiene el esquema completo de la BD para la IA
 */
exports.getSchema = asyncHandler(async (req, res) => {
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const schema = await DatabaseService.getSchemaInfo();
    res.json({
        success: true,
        data: schema
    });
});

/**
 * GET /api/qwen/db/context
 * Obtiene datos de contexto para la IA (tipos de seguros, coberturas, tarifas, etc.)
 */
exports.getContext = asyncHandler(async (req, res) => {
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const context = await DatabaseService.getContextData();
    res.json({
        success: true,
        data: context
    });
});

/**
 * POST /api/qwen/db/query
 * Ejecuta una consulta SELECT segura (solo lectura)
 */
exports.executeQuery = asyncHandler(async (req, res) => {
    const { sql } = req.body;
    
    if (!sql) {
        return res.status(400).json({
            success: false,
            error: 'El campo "sql" es requerido'
        });
    }
    
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    try {
        const results = await DatabaseService.safeQuery(sql);
        res.json({
            success: true,
            data: results,
            rowCount: results.length
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/qwen/db/cotizar/auto
 * Genera una cotización de seguro de auto
 */
exports.cotizarAuto = asyncHandler(async (req, res) => {
    const { marca, modelo, anio, valor, tipoCobertura, zonaId } = req.body;
    
    if (!marca || !modelo || !anio) {
        return res.status(400).json({
            success: false,
            error: 'Se requiere marca, modelo y año del vehículo'
        });
    }
    
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    try {
        const cotizacion = await DatabaseService.generarCotizacionAuto({
            marca,
            modelo,
            anio: parseInt(anio),
            valor: parseFloat(valor) || null,
            tipoCobertura,
            zonaId: parseInt(zonaId) || 1
        });
        
        res.json({
            success: true,
            data: cotizacion
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/qwen/db/tipos-seguros
 * Lista todos los tipos de seguros disponibles
 */
exports.getTiposSeguros = asyncHandler(async (req, res) => {
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const tipos = await DatabaseService.query('SELECT * FROM tipos_seguros WHERE activo = TRUE');
    res.json({
        success: true,
        data: tipos
    });
});

/**
 * GET /api/qwen/db/coberturas/:tipoSeguroId
 * Lista coberturas por tipo de seguro
 */
exports.getCoberturas = asyncHandler(async (req, res) => {
    const { tipoSeguroId } = req.params;
    
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const coberturas = await DatabaseService.query(
        'SELECT * FROM coberturas WHERE tipo_seguro_id = ? AND activo = TRUE',
        [tipoSeguroId]
    );
    res.json({
        success: true,
        data: coberturas
    });
});

/**
 * GET /api/qwen/db/marcas
 * Lista todas las marcas de vehículos
 */
exports.getMarcas = asyncHandler(async (req, res) => {
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const marcas = await DatabaseService.query('SELECT * FROM marcas_vehiculos WHERE activo = TRUE ORDER BY nombre');
    res.json({
        success: true,
        data: marcas
    });
});

/**
 * GET /api/qwen/db/zonas
 * Lista todas las zonas
 */
exports.getZonas = asyncHandler(async (req, res) => {
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const zonas = await DatabaseService.query('SELECT * FROM zonas WHERE activo = TRUE');
    res.json({
        success: true,
        data: zonas
    });
});

/**
 * GET /api/qwen/db/cotizaciones
 * Lista las últimas cotizaciones
 */
exports.getCotizaciones = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    
    if (!DatabaseService.isDBConnected()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no conectada'
        });
    }
    
    const cotizaciones = await DatabaseService.query(`
        SELECT c.*, ts.nombre as tipo_seguro_nombre
        FROM cotizaciones c
        JOIN tipos_seguros ts ON c.tipo_seguro_id = ts.id
        ORDER BY c.created_at DESC
        LIMIT ?
    `, [limit]);
    
    res.json({
        success: true,
        data: cotizaciones
    });
});
