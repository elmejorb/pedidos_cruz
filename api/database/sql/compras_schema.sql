-- ============================================================
-- Compras a proveedores y cuentas por pagar - Pedidos Cruz
-- ============================================================
SET NAMES utf8mb4;

ALTER TABLE pc_proveedores
    ADD COLUMN direccion VARCHAR(200) NULL DEFAULT NULL AFTER contacto,
    ADD COLUMN email VARCHAR(150) NULL DEFAULT NULL AFTER direccion;

CREATE TABLE IF NOT EXISTS pc_compras (
    id_compra INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    numero INT NOT NULL COMMENT 'Consecutivo interno de compra',
    id_proveedor INT NOT NULL,
    factura_proveedor VARCHAR(50) NOT NULL COMMENT 'Número de la factura del proveedor',
    fecha DATE NOT NULL,
    forma_pago ENUM('contado','credito') NOT NULL DEFAULT 'contado',
    dias_credito INT NOT NULL DEFAULT 0,
    fecha_vencimiento DATE NULL,
    medio_pago VARCHAR(20) NULL COMMENT 'Contado: efectivo, transferencia, nequi...',
    iva_incluido TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = los costos digitados incluyen IVA',
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Base antes de descuento',
    descuento DECIMAL(14,2) NOT NULL DEFAULT 0,
    iva DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'IVA neto (después del descuento)',
    flete DECIMAL(14,2) NOT NULL DEFAULT 0,
    total DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Total de la factura del proveedor',
    retencion DECIMAL(14,2) NOT NULL DEFAULT 0,
    neto_pagar DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Total - retención',
    saldo DECIMAL(14,2) NOT NULL DEFAULT 0,
    estado ENUM('recibida','anulada') NOT NULL DEFAULT 'recibida',
    notas VARCHAR(500) NULL,
    motivo_anulacion VARCHAR(300) NULL,
    id_usuario INT NULL,
    id_usuario_anula INT NULL,
    anulada_at DATETIME NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_compra_numero (numero),
    KEY idx_proveedor (id_proveedor),
    KEY idx_fecha (fecha),
    KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pc_compra_detalle (
    id_detalle INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_compra INT NOT NULL,
    id_producto INT NOT NULL,
    codigo VARCHAR(50) NULL,
    descripcion VARCHAR(200) NOT NULL,
    tipo_unidad ENUM('unidad','caja') NOT NULL DEFAULT 'unidad',
    unidades_por_caja INT NOT NULL DEFAULT 1,
    cantidad DECIMAL(12,2) NOT NULL COMMENT 'Cantidad digitada (unidades o cajas)',
    unidades INT NOT NULL COMMENT 'Unidades que entran al stock',
    costo DECIMAL(14,2) NOT NULL COMMENT 'Costo digitado por unidad/caja (con o sin IVA según la compra)',
    costo_sin_iva DECIMAL(14,4) NOT NULL COMMENT 'Por unidad/caja',
    iva_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    subtotal DECIMAL(14,2) NOT NULL COMMENT 'Base de la línea (sin IVA, antes de descuento)',
    iva DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'IVA neto de la línea',
    flete DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Flete prorrateado a la línea',
    total DECIMAL(14,2) NOT NULL COMMENT 'Costo total de la línea (con descuento, IVA y flete)',
    costo_unitario_final DECIMAL(14,4) NOT NULL COMMENT 'Costo por unidad de stock: queda como precio de costo',
    costo_anterior DECIMAL(14,2) NULL,
    precio_venta_anterior DECIMAL(12,2) NULL,
    precio_venta_nuevo DECIMAL(12,2) NULL,
    KEY idx_compra (id_compra),
    KEY idx_producto (id_producto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pagos / abonos a proveedores. Un comprobante puede pagar varias compras (una fila por compra).
CREATE TABLE IF NOT EXISTS pc_pagos_proveedor (
    id_pago INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    comprobante INT NOT NULL,
    id_proveedor INT NOT NULL,
    id_compra INT NOT NULL,
    fecha DATE NOT NULL,
    valor DECIMAL(14,2) NOT NULL,
    descuento DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Descuento por pronto pago (también reduce el saldo)',
    medio_pago VARCHAR(20) NOT NULL DEFAULT 'efectivo',
    referencia VARCHAR(80) NULL,
    notas VARCHAR(300) NULL,
    automatico TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = pago de una compra de contado',
    estado ENUM('valido','anulado') NOT NULL DEFAULT 'valido',
    motivo_anulacion VARCHAR(300) NULL,
    id_usuario INT NULL,
    id_usuario_anula INT NULL,
    anulado_at DATETIME NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_comprobante (comprobante),
    KEY idx_proveedor (id_proveedor),
    KEY idx_compra (id_compra)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
