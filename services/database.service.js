/**
 * Servicio de Base de Datos MySQL para HDI Seguros
 * Maneja conexión, creación automática de tablas y consultas
 */

const mysql = require('mysql2/promise');

class DatabaseService {
    static pool = null;
    static isConnected = false;

    /**
     * Inicializa el pool de conexiones a MySQL
     */
    static async initialize() {
        if (this.pool) {
            return this.pool;
        }

        const config = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'qwen_user',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'Qwen-IA',
            port: parseInt(process.env.DB_PORT) || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        };

        try {
            console.log(`[DB] Conectando a MySQL: ${config.host}:${config.port}/${config.database}`);
            this.pool = mysql.createPool(config);
            
            // Probar conexión
            const connection = await this.pool.getConnection();
            console.log(`[DB] Conexión exitosa a MySQL`);
            connection.release();
            
            this.isConnected = true;
            
            // Crear tablas si no existen
            await this.createTables();
            
            return this.pool;
        } catch (error) {
            console.error(`[DB ERROR] Error conectando a MySQL: ${error.message}`);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Obtiene el pool de conexiones
     */
    static getPool() {
        return this.pool;
    }

    /**
     * Verifica si está conectado a la BD
     */
    static isDBConnected() {
        return this.isConnected;
    }

    /**
     * Ejecuta una consulta SQL
     */
    static async query(sql, params = []) {
        if (!this.pool) {
            await this.initialize();
        }
        
        try {
            const [results] = await this.pool.execute(sql, params);
            return results;
        } catch (error) {
            console.error(`[DB ERROR] Query failed: ${error.message}`);
            console.error(`[DB ERROR] SQL: ${sql.substring(0, 200)}`);
            throw error;
        }
    }

    /**
     * Crea todas las tablas necesarias para el sistema de seguros
     */
    static async createTables() {
        console.log(`[DB] Verificando y creando tablas...`);
        
        const tables = [
            // Tabla de tipos de seguros
            `CREATE TABLE IF NOT EXISTS tipos_seguros (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50) UNIQUE NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                descripcion TEXT,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`,
            
            // Tabla de coberturas
            `CREATE TABLE IF NOT EXISTS coberturas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo_seguro_id INT NOT NULL,
                codigo VARCHAR(50) NOT NULL,
                nombre VARCHAR(150) NOT NULL,
                descripcion TEXT,
                suma_asegurada_min DECIMAL(15,2) DEFAULT 0,
                suma_asegurada_max DECIMAL(15,2) DEFAULT 0,
                deducible_porcentaje DECIMAL(5,2) DEFAULT 0,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (tipo_seguro_id) REFERENCES tipos_seguros(id) ON DELETE CASCADE,
                UNIQUE KEY unique_cobertura (tipo_seguro_id, codigo)
            )`,
            
            // Tabla de tarifas base
            `CREATE TABLE IF NOT EXISTS tarifas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo_seguro_id INT NOT NULL,
                cobertura_id INT,
                nombre VARCHAR(100) NOT NULL,
                prima_base DECIMAL(15,2) NOT NULL,
                factor_edad DECIMAL(8,4) DEFAULT 1.0000,
                factor_antiguedad DECIMAL(8,4) DEFAULT 1.0000,
                factor_zona DECIMAL(8,4) DEFAULT 1.0000,
                vigencia_inicio DATE,
                vigencia_fin DATE,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (tipo_seguro_id) REFERENCES tipos_seguros(id) ON DELETE CASCADE,
                FOREIGN KEY (cobertura_id) REFERENCES coberturas(id) ON DELETE SET NULL
            )`,
            
            // Tabla de zonas/regiones
            `CREATE TABLE IF NOT EXISTS zonas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(20) UNIQUE NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                factor_riesgo DECIMAL(8,4) DEFAULT 1.0000,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Tabla de clientes
            `CREATE TABLE IF NOT EXISTS clientes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                numero_cliente VARCHAR(50) UNIQUE,
                nombre VARCHAR(100) NOT NULL,
                apellido_paterno VARCHAR(100),
                apellido_materno VARCHAR(100),
                fecha_nacimiento DATE,
                genero ENUM('M', 'F', 'O') DEFAULT 'O',
                email VARCHAR(150),
                telefono VARCHAR(20),
                direccion TEXT,
                codigo_postal VARCHAR(10),
                zona_id INT,
                rfc VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE SET NULL
            )`,
            
            // Tabla de vehículos (para seguro de auto)
            `CREATE TABLE IF NOT EXISTS vehiculos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cliente_id INT,
                marca VARCHAR(50) NOT NULL,
                modelo VARCHAR(100) NOT NULL,
                anio INT NOT NULL,
                version VARCHAR(100),
                numero_serie VARCHAR(50),
                placas VARCHAR(20),
                color VARCHAR(30),
                uso ENUM('particular', 'comercial', 'taxi', 'uber') DEFAULT 'particular',
                valor_factura DECIMAL(15,2),
                valor_comercial DECIMAL(15,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
            )`,
            
            // Tabla de cotizaciones
            `CREATE TABLE IF NOT EXISTS cotizaciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                numero_cotizacion VARCHAR(50) UNIQUE NOT NULL,
                cliente_id INT,
                tipo_seguro_id INT NOT NULL,
                vehiculo_id INT,
                fecha_cotizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_vigencia_inicio DATE,
                fecha_vigencia_fin DATE,
                prima_neta DECIMAL(15,2) NOT NULL,
                recargo DECIMAL(15,2) DEFAULT 0,
                descuento DECIMAL(15,2) DEFAULT 0,
                iva DECIMAL(15,2) DEFAULT 0,
                prima_total DECIMAL(15,2) NOT NULL,
                estatus ENUM('pendiente', 'aprobada', 'rechazada', 'emitida', 'cancelada') DEFAULT 'pendiente',
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
                FOREIGN KEY (tipo_seguro_id) REFERENCES tipos_seguros(id) ON DELETE CASCADE,
                FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE SET NULL
            )`,
            
            // Tabla de detalle de coberturas en cotización
            `CREATE TABLE IF NOT EXISTS cotizacion_coberturas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cotizacion_id INT NOT NULL,
                cobertura_id INT NOT NULL,
                suma_asegurada DECIMAL(15,2),
                deducible DECIMAL(15,2),
                prima DECIMAL(15,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
                FOREIGN KEY (cobertura_id) REFERENCES coberturas(id) ON DELETE CASCADE
            )`,
            
            // Tabla de pólizas emitidas
            `CREATE TABLE IF NOT EXISTS polizas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                numero_poliza VARCHAR(50) UNIQUE NOT NULL,
                cotizacion_id INT,
                cliente_id INT NOT NULL,
                tipo_seguro_id INT NOT NULL,
                fecha_emision DATE NOT NULL,
                fecha_inicio_vigencia DATE NOT NULL,
                fecha_fin_vigencia DATE NOT NULL,
                prima_total DECIMAL(15,2) NOT NULL,
                estatus ENUM('vigente', 'cancelada', 'vencida', 'siniestrada') DEFAULT 'vigente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
                FOREIGN KEY (tipo_seguro_id) REFERENCES tipos_seguros(id) ON DELETE CASCADE
            )`,
            
            // Tabla de marcas de vehículos
            `CREATE TABLE IF NOT EXISTS marcas_vehiculos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) UNIQUE NOT NULL,
                factor_riesgo DECIMAL(8,4) DEFAULT 1.0000,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Tabla de modelos de vehículos
            `CREATE TABLE IF NOT EXISTS modelos_vehiculos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                marca_id INT NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                anio_inicio INT,
                anio_fin INT,
                tipo ENUM('sedan', 'suv', 'pickup', 'hatchback', 'deportivo', 'van', 'otro') DEFAULT 'sedan',
                factor_riesgo DECIMAL(8,4) DEFAULT 1.0000,
                valor_referencia DECIMAL(15,2),
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (marca_id) REFERENCES marcas_vehiculos(id) ON DELETE CASCADE
            )`,
            
            // Tabla de configuración general
            `CREATE TABLE IF NOT EXISTS configuracion (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave VARCHAR(100) UNIQUE NOT NULL,
                valor TEXT,
                descripcion VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        ];

        for (const createTableSQL of tables) {
            try {
                await this.query(createTableSQL);
            } catch (error) {
                console.error(`[DB ERROR] Error creando tabla: ${error.message}`);
            }
        }
        
        console.log(`[DB] Tablas verificadas/creadas exitosamente`);
        
        // Insertar datos iniciales si no existen
        await this.insertInitialData();
    }

    /**
     * Inserta datos iniciales en las tablas
     */
    static async insertInitialData() {
        try {
            // Verificar si ya hay tipos de seguros
            const tiposExistentes = await this.query('SELECT COUNT(*) as count FROM tipos_seguros');
            if (tiposExistentes[0].count > 0) {
                console.log(`[DB] Datos iniciales ya existen, omitiendo inserción`);
                return;
            }
            
            console.log(`[DB] Insertando datos iniciales...`);
            
            // Tipos de seguros
            await this.query(`
                INSERT INTO tipos_seguros (codigo, nombre, descripcion) VALUES
                ('AUTO', 'Seguro de Automóvil', 'Protección integral para tu vehículo'),
                ('VIDA', 'Seguro de Vida', 'Protección para ti y tu familia'),
                ('HOGAR', 'Seguro de Hogar', 'Protección para tu casa y contenidos'),
                ('SALUD', 'Seguro de Gastos Médicos', 'Cobertura de gastos médicos mayores'),
                ('EMPRESARIAL', 'Seguro Empresarial', 'Protección integral para tu negocio')
            `);
            
            // Zonas
            await this.query(`
                INSERT INTO zonas (codigo, nombre, factor_riesgo) VALUES
                ('CDMX', 'Ciudad de México', 1.30),
                ('MTY', 'Monterrey', 1.15),
                ('GDL', 'Guadalajara', 1.10),
                ('NORTE', 'Zona Norte', 1.20),
                ('SUR', 'Zona Sur', 1.05),
                ('CENTRO', 'Zona Centro', 1.00),
                ('BAJIO', 'Zona Bajío', 1.08)
            `);
            
            // Marcas de vehículos
            await this.query(`
                INSERT INTO marcas_vehiculos (nombre, factor_riesgo) VALUES
                ('Nissan', 1.00),
                ('Volkswagen', 1.05),
                ('Chevrolet', 1.00),
                ('Toyota', 0.95),
                ('Honda', 0.95),
                ('Ford', 1.05),
                ('Mazda', 1.00),
                ('Kia', 0.98),
                ('Hyundai', 0.98),
                ('BMW', 1.30),
                ('Mercedes-Benz', 1.35),
                ('Audi', 1.25)
            `);
            
            // Obtener ID del tipo de seguro AUTO
            const tipoAuto = await this.query('SELECT id FROM tipos_seguros WHERE codigo = ?', ['AUTO']);
            const tipoAutoId = tipoAuto[0]?.id;
            
            if (tipoAutoId) {
                // Coberturas de auto
                await this.query(`
                    INSERT INTO coberturas (tipo_seguro_id, codigo, nombre, descripcion, suma_asegurada_min, suma_asegurada_max, deducible_porcentaje) VALUES
                    (?, 'RC_BIENES', 'Responsabilidad Civil Daños a Bienes', 'Cubre daños causados a propiedad de terceros', 500000, 3000000, 0),
                    (?, 'RC_PERSONAS', 'Responsabilidad Civil Daños a Personas', 'Cubre lesiones o muerte a terceros', 1000000, 5000000, 0),
                    (?, 'ROBO_TOTAL', 'Robo Total', 'Cubre el robo total del vehículo', 0, 0, 10),
                    (?, 'DM_COLISION', 'Daños Materiales por Colisión', 'Cubre daños por colisión', 0, 0, 5),
                    (?, 'DM_FENOMENOS', 'Daños por Fenómenos Naturales', 'Cubre daños por eventos naturales', 0, 0, 5),
                    (?, 'ASISTENCIA', 'Asistencia Vial', 'Servicio de grúa, paso de corriente, etc.', 0, 0, 0),
                    (?, 'GM_OCUPANTES', 'Gastos Médicos Ocupantes', 'Cubre gastos médicos de ocupantes', 50000, 500000, 0),
                    (?, 'DEFENSA_LEGAL', 'Defensa Legal', 'Asistencia legal en caso de accidente', 0, 0, 0)
                `, [tipoAutoId, tipoAutoId, tipoAutoId, tipoAutoId, tipoAutoId, tipoAutoId, tipoAutoId, tipoAutoId]);
                
                // Tarifas base para auto
                await this.query(`
                    INSERT INTO tarifas (tipo_seguro_id, nombre, prima_base, factor_edad, factor_antiguedad, factor_zona) VALUES
                    (?, 'Cobertura Básica', 3500.00, 1.0, 1.0, 1.0),
                    (?, 'Cobertura Amplia', 8500.00, 1.0, 1.0, 1.0),
                    (?, 'Cobertura Premium', 15000.00, 1.0, 1.0, 1.0)
                `, [tipoAutoId, tipoAutoId, tipoAutoId]);
            }
            
            // Configuración inicial
            await this.query(`
                INSERT INTO configuracion (clave, valor, descripcion) VALUES
                ('IVA_PORCENTAJE', '16', 'Porcentaje de IVA aplicable'),
                ('RECARGO_PAGO_FRACCIONADO', '5', 'Porcentaje de recargo por pago fraccionado'),
                ('DESCUENTO_PAGO_ANUAL', '10', 'Porcentaje de descuento por pago anual'),
                ('VIGENCIA_COTIZACION_DIAS', '30', 'Días de vigencia de una cotización'),
                ('PREFIJO_COTIZACION', 'COT', 'Prefijo para números de cotización'),
                ('PREFIJO_POLIZA', 'POL', 'Prefijo para números de póliza')
            `);
            
            console.log(`[DB] Datos iniciales insertados exitosamente`);
        } catch (error) {
            console.error(`[DB ERROR] Error insertando datos iniciales: ${error.message}`);
        }
    }

    /**
     * Obtiene información del esquema de la base de datos para que la IA pueda consultarla
     */
    static async getSchemaInfo() {
        try {
            const tables = await this.query(`
                SELECT TABLE_NAME, TABLE_COMMENT 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = ?
            `, [process.env.DB_NAME || 'Qwen-IA']);
            
            const schemaInfo = [];
            
            for (const table of tables) {
                const columns = await this.query(`
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
                    FROM information_schema.COLUMNS 
                    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                `, [process.env.DB_NAME || 'Qwen-IA', table.TABLE_NAME]);
                
                schemaInfo.push({
                    table: table.TABLE_NAME,
                    comment: table.TABLE_COMMENT,
                    columns: columns.map(c => ({
                        name: c.COLUMN_NAME,
                        type: c.DATA_TYPE,
                        nullable: c.IS_NULLABLE === 'YES',
                        key: c.COLUMN_KEY
                    }))
                });
            }
            
            return schemaInfo;
        } catch (error) {
            console.error(`[DB ERROR] Error obteniendo schema: ${error.message}`);
            return [];
        }
    }

    /**
     * Obtiene datos resumidos de la BD para contexto de la IA
     */
    static async getContextData() {
        try {
            const context = {};
            
            // Tipos de seguros disponibles
            context.tiposSeguros = await this.query('SELECT * FROM tipos_seguros WHERE activo = TRUE');
            
            // Coberturas por tipo
            context.coberturas = await this.query(`
                SELECT c.*, ts.nombre as tipo_seguro_nombre 
                FROM coberturas c 
                JOIN tipos_seguros ts ON c.tipo_seguro_id = ts.id 
                WHERE c.activo = TRUE
            `);
            
            // Tarifas
            context.tarifas = await this.query(`
                SELECT t.*, ts.nombre as tipo_seguro_nombre 
                FROM tarifas t 
                JOIN tipos_seguros ts ON t.tipo_seguro_id = ts.id 
                WHERE t.activo = TRUE
            `);
            
            // Zonas
            context.zonas = await this.query('SELECT * FROM zonas WHERE activo = TRUE');
            
            // Marcas de vehículos
            context.marcas = await this.query('SELECT * FROM marcas_vehiculos WHERE activo = TRUE');
            
            // Configuración
            const config = await this.query('SELECT clave, valor FROM configuracion');
            context.configuracion = {};
            config.forEach(c => context.configuracion[c.clave] = c.valor);
            
            return context;
        } catch (error) {
            console.error(`[DB ERROR] Error obteniendo contexto: ${error.message}`);
            return null;
        }
    }

    /**
     * Ejecuta una consulta segura generada por la IA (solo SELECT)
     */
    static async safeQuery(sql) {
        // Validar que sea solo SELECT para seguridad
        const normalizedSQL = sql.trim().toUpperCase();
        if (!normalizedSQL.startsWith('SELECT')) {
            throw new Error('Solo se permiten consultas SELECT por seguridad');
        }
        
        // Bloquear operaciones peligrosas
        const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE'];
        for (const word of forbidden) {
            if (normalizedSQL.includes(word)) {
                throw new Error(`Operación ${word} no permitida`);
            }
        }
        
        return await this.query(sql);
    }

    /**
     * Genera una cotización de seguro de auto
     */
    static async generarCotizacionAuto(datos) {
        const {
            marca,
            modelo,
            anio,
            valor,
            tipoCobertura = 'Cobertura Amplia',
            zonaId,
            clienteId = null
        } = datos;
        
        try {
            // Obtener factor de marca
            const marcaInfo = await this.query('SELECT factor_riesgo FROM marcas_vehiculos WHERE nombre = ?', [marca]);
            const factorMarca = marcaInfo[0]?.factor_riesgo || 1.0;
            
            // Obtener factor de zona
            const zonaInfo = await this.query('SELECT factor_riesgo FROM zonas WHERE id = ?', [zonaId]);
            const factorZona = zonaInfo[0]?.factor_riesgo || 1.0;
            
            // Obtener tarifa base
            const tipoAuto = await this.query('SELECT id FROM tipos_seguros WHERE codigo = ?', ['AUTO']);
            const tipoAutoId = tipoAuto[0]?.id;
            
            const tarifa = await this.query(
                'SELECT prima_base FROM tarifas WHERE tipo_seguro_id = ? AND nombre = ? AND activo = TRUE',
                [tipoAutoId, tipoCobertura]
            );
            const primaBase = tarifa[0]?.prima_base || 8500;
            
            // Calcular factor de antigüedad (más antiguo = más caro)
            const antiguedad = new Date().getFullYear() - anio;
            let factorAntiguedad = 1.0;
            if (antiguedad <= 0) factorAntiguedad = 0.90;
            else if (antiguedad <= 3) factorAntiguedad = 1.00;
            else if (antiguedad <= 5) factorAntiguedad = 1.10;
            else if (antiguedad <= 10) factorAntiguedad = 1.20;
            else factorAntiguedad = 1.35;
            
            // Calcular factor por valor del vehículo
            const factorValor = valor ? (valor / 300000) : 1.0;
            
            // Calcular prima neta
            const primaNeta = primaBase * factorMarca * factorZona * factorAntiguedad * Math.max(0.5, Math.min(2.0, factorValor));
            
            // Obtener IVA de configuración
            const configIVA = await this.query('SELECT valor FROM configuracion WHERE clave = ?', ['IVA_PORCENTAJE']);
            const ivaPorcentaje = parseFloat(configIVA[0]?.valor || 16) / 100;
            
            const iva = primaNeta * ivaPorcentaje;
            const primaTotal = primaNeta + iva;
            
            // Generar número de cotización
            const prefijo = (await this.query('SELECT valor FROM configuracion WHERE clave = ?', ['PREFIJO_COTIZACION']))[0]?.valor || 'COT';
            const timestamp = Date.now();
            const numeroCotizacion = `${prefijo}-${timestamp}`;
            
            // Insertar cotización
            const result = await this.query(`
                INSERT INTO cotizaciones 
                (numero_cotizacion, cliente_id, tipo_seguro_id, prima_neta, iva, prima_total, notas)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                numeroCotizacion,
                clienteId,
                tipoAutoId,
                primaNeta.toFixed(2),
                iva.toFixed(2),
                primaTotal.toFixed(2),
                JSON.stringify({ marca, modelo, anio, valor, tipoCobertura, factores: { marca: factorMarca, zona: factorZona, antiguedad: factorAntiguedad, valor: factorValor }})
            ]);
            
            return {
                numeroCotizacion,
                vehiculo: { marca, modelo, anio, valor },
                cobertura: tipoCobertura,
                primaNeta: parseFloat(primaNeta.toFixed(2)),
                iva: parseFloat(iva.toFixed(2)),
                primaTotal: parseFloat(primaTotal.toFixed(2)),
                primaAnual: parseFloat(primaTotal.toFixed(2)),
                primaMensual: parseFloat((primaTotal / 12).toFixed(2)),
                factoresAplicados: {
                    marca: factorMarca,
                    zona: factorZona,
                    antiguedad: factorAntiguedad,
                    valor: factorValor.toFixed(2)
                },
                vigencia: '1 año',
                fechaCotizacion: new Date().toISOString()
            };
        } catch (error) {
            console.error(`[DB ERROR] Error generando cotización: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cierra el pool de conexiones
     */
    static async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
            console.log(`[DB] Conexión cerrada`);
        }
    }
}

module.exports = DatabaseService;
