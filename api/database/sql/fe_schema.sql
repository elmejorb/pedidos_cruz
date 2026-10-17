-- ============================================================
-- Facturación Electrónica DIAN - Pedidos Cruz
-- Ejecutar DESPUÉS de fe_catalogos.sql
-- ============================================================
SET NAMES utf8mb4;

-- Datos fiscales del cliente
ALTER TABLE pc_clientes
    ADD COLUMN tipo_documento VARCHAR(2) NOT NULL DEFAULT '13' COMMENT 'Código DIAN: 13=CC, 31=NIT, 22=CE, 41=Pasaporte, 42=Doc. extranjero' AFTER nit_cedula,
    ADD COLUMN tipo_organizacion TINYINT NOT NULL DEFAULT 2 COMMENT '1=Jurídica, 2=Natural' AFTER tipo_documento,
    ADD COLUMN id_responsabilidad TINYINT NOT NULL DEFAULT 4 COMMENT 'API type_liabilities: 1=Gran contrib., 2=Autorretenedor, 3=Agente ret. IVA, 4=No aplica (R-99-PN)' AFTER tipo_organizacion,
    ADD COLUMN id_municipio INT UNSIGNED NULL COMMENT 'pc_dian_municipios.id (id de la API)' AFTER ciudad;

-- Datos fiscales del producto
ALTER TABLE pc_productos
    ADD COLUMN iva DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '% IVA incluido en el precio (0, 5, 19)' AFTER precio,
    ADD COLUMN unit_measure_id INT UNSIGNED NOT NULL DEFAULT 70 COMMENT 'API unit_measures.id (70=unidad)' AFTER iva;

-- Configuración (una sola fila, id=1)
CREATE TABLE IF NOT EXISTS pc_config_fe (
    id INT NOT NULL PRIMARY KEY,
    activo TINYINT(1) NOT NULL DEFAULT 0,
    api_url VARCHAR(255) NOT NULL DEFAULT 'https://api-electronica.innovacion-digital.com/public',
    api_email VARCHAR(150) NULL,
    api_password VARCHAR(255) NULL,
    enviar_email TINYINT(1) NOT NULL DEFAULT 1,
    -- Datos de la empresa para la representación gráfica
    empresa_nombre VARCHAR(200) NULL,
    empresa_propietario VARCHAR(200) NULL,
    empresa_nit VARCHAR(30) NULL,
    empresa_direccion VARCHAR(255) NULL,
    empresa_telefono VARCHAR(60) NULL,
    empresa_email VARCHAR(150) NULL,
    empresa_regimen VARCHAR(100) NULL DEFAULT 'No responsable de IVA',
    empresa_logo_url VARCHAR(255) NULL,
    -- Resolución de numeración (texto del pie del PDF)
    resolucion_numero VARCHAR(50) NULL,
    resolucion_fecha DATE NULL,
    resolucion_vigencia DATE NULL,
    resolucion_prefijo VARCHAR(10) NULL,
    resolucion_desde INT NULL,
    resolucion_hasta INT NULL,
    id_municipio_default INT UNSIGNED NULL,
    nota_legal TEXT NULL,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO pc_config_fe (id, nota_legal) VALUES (1,
 'Esta factura se asimila en todos sus efectos a una letra de cambio de conformidad con el Art. 774 del código de comercio. Autorizo que en caso de incumplimiento de esta obligación sea reportado a las centrales de riesgo, se cobrarán intereses por mora.');

-- Facturas electrónicas (encabezado + snapshot de cliente)
CREATE TABLE IF NOT EXISTS pc_facturas (
    id_factura INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    estado ENUM('pendiente','autorizada','rechazada','error') NOT NULL DEFAULT 'pendiente',
    prefijo VARCHAR(10) NULL,
    numero INT NULL,
    cufe VARCHAR(120) NULL,
    fecha_emision DATETIME NULL,
    -- Cliente (snapshot al momento de facturar)
    cliente_identificacion VARCHAR(30) NOT NULL,
    cliente_dv VARCHAR(2) NULL,
    cliente_tipo_documento VARCHAR(2) NOT NULL DEFAULT '13',
    cliente_nombre VARCHAR(200) NOT NULL,
    cliente_direccion VARCHAR(255) NULL,
    cliente_telefono VARCHAR(30) NULL,
    cliente_email VARCHAR(255) NULL,
    cliente_municipio VARCHAR(150) NULL,
    -- Pago
    forma_pago TINYINT NOT NULL DEFAULT 1 COMMENT '1=Contado, 2=Crédito',
    medio_pago SMALLINT NOT NULL DEFAULT 10 COMMENT 'Código DIAN',
    dias_credito INT NOT NULL DEFAULT 0,
    fecha_vencimiento DATE NULL,
    -- Totales
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Base gravable (sin IVA)',
    iva DECIMAL(14,2) NOT NULL DEFAULT 0,
    descuento DECIMAL(14,2) NOT NULL DEFAULT 0,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    nota TEXT NULL,
    -- DIAN
    status_code VARCHAR(10) NULL,
    mensaje_dian VARCHAR(500) NULL,
    errores JSON NULL,
    request_json LONGTEXT NULL,
    response_json LONGTEXT NULL,
    intentos INT NOT NULL DEFAULT 0,
    email_enviado TINYINT(1) NOT NULL DEFAULT 0,
    email_enviado_at DATETIME NULL,
    id_usuario INT NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_pedido (id_pedido),
    KEY idx_estado (estado),
    KEY idx_cufe (cufe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pc_factura_detalle (
    id_detalle INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_factura INT NOT NULL,
    id_producto INT NULL,
    codigo VARCHAR(50) NULL,
    descripcion VARCHAR(255) NOT NULL,
    unit_measure_id INT UNSIGNED NOT NULL DEFAULT 70,
    unidad VARCHAR(30) NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    precio DECIMAL(14,2) NOT NULL COMMENT 'Precio unitario con IVA incluido',
    descuento DECIMAL(14,2) NOT NULL DEFAULT 0,
    iva_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    base DECIMAL(14,2) NOT NULL DEFAULT 0,
    iva DECIMAL(14,2) NOT NULL DEFAULT 0,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    KEY idx_factura (id_factura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
