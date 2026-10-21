-- ============================================================
-- Notas Crédito (anulación de facturas electrónicas) - Pedidos Cruz
-- ============================================================
SET NAMES utf8mb4;

ALTER TABLE pc_facturas
    MODIFY estado ENUM('pendiente','autorizada','rechazada','error','anulada') NOT NULL DEFAULT 'pendiente';

CREATE TABLE IF NOT EXISTS pc_notas_credito (
    id_nota INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_factura INT NOT NULL,
    estado ENUM('pendiente','autorizada','rechazada','error') NOT NULL DEFAULT 'pendiente',
    concepto TINYINT NOT NULL DEFAULT 2 COMMENT '2 = Anulación de factura electrónica (Lista 34 DIAN)',
    motivo VARCHAR(500) NOT NULL,
    prefijo VARCHAR(10) NULL,
    numero VARCHAR(30) NULL,
    cufe VARCHAR(120) NULL,
    fecha_emision DATETIME NULL,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    status_code VARCHAR(10) NULL,
    mensaje_dian VARCHAR(500) NULL,
    errores JSON NULL,
    request_json LONGTEXT NULL,
    response_json LONGTEXT NULL,
    id_usuario INT NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_factura (id_factura),
    KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
