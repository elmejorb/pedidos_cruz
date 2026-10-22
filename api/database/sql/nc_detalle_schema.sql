-- ============================================================
-- Líneas de las notas crédito (devoluciones parciales) - Pedidos Cruz
-- ============================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS pc_nota_credito_detalle (
    id_detalle INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_nota INT NOT NULL,
    id_detalle_factura INT NOT NULL,
    id_producto INT NULL,
    codigo VARCHAR(50) NULL,
    descripcion VARCHAR(255) NOT NULL,
    unidad VARCHAR(30) NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    precio DECIMAL(14,2) NOT NULL COMMENT 'Precio unitario con IVA incluido',
    iva_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    base DECIMAL(14,2) NOT NULL DEFAULT 0,
    iva DECIMAL(14,2) NOT NULL DEFAULT 0,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    unidades_stock INT NOT NULL DEFAULT 0 COMMENT 'Unidades devueltas al inventario',
    KEY idx_nota (id_nota),
    KEY idx_detalle_factura (id_detalle_factura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
