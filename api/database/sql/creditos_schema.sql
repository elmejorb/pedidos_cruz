-- ============================================================
-- Créditos y Pagos - Pedidos Cruz
-- ============================================================
SET NAMES utf8mb4;

-- Tipo de pedido: contado (default, como hasta ahora) o crédito
ALTER TABLE pc_pedidos
    ADD COLUMN forma_pago ENUM('contado','credito') NOT NULL DEFAULT 'contado' AFTER estado,
    ADD COLUMN dias_credito INT NOT NULL DEFAULT 0 COMMENT 'Plazo en días (solo crédito)' AFTER forma_pago,
    ADD KEY idx_forma_pago (forma_pago);

-- Pagos / abonos a pedidos a crédito
CREATE TABLE IF NOT EXISTS pc_pagos (
    id_pago INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_cliente INT NOT NULL,
    fecha DATE NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    medio_pago ENUM('efectivo','transferencia','consignacion','nequi','daviplata','tarjeta','cheque','otro') NOT NULL DEFAULT 'efectivo',
    referencia VARCHAR(100) NULL,
    notas VARCHAR(255) NULL,
    id_usuario INT NOT NULL,
    anulado TINYINT(1) NOT NULL DEFAULT 0,
    anulado_por INT NULL,
    anulado_at DATETIME NULL,
    motivo_anulacion VARCHAR(255) NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_pedido (id_pedido),
    KEY idx_cliente (id_cliente),
    KEY idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
