-- ============================================================
-- Conteo de inventario (toma física) - Pedidos Cruz
-- ============================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS pc_conteos (
    id_conteo INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    alcance ENUM('todo','catalogo','categoria','proveedor') NOT NULL DEFAULT 'todo',
    id_alcance INT NULL COMMENT 'id del catálogo, categoría o proveedor según alcance',
    alcance_nombre VARCHAR(150) NULL,
    estado ENUM('abierto','aplicado','cancelado') NOT NULL DEFAULT 'abierto',
    notas VARCHAR(500) NULL,
    no_contados_en_cero TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Al aplicar, los no contados quedaron en 0',
    productos_ajustados INT NOT NULL DEFAULT 0,
    unidades_ajuste INT NOT NULL DEFAULT 0,
    valor_ajuste DECIMAL(14,2) NOT NULL DEFAULT 0,
    id_usuario INT NULL,
    id_usuario_aplica INT NULL,
    aplicado_at DATETIME NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una fila por producto contado. stock_sistema = stock del sistema en el momento de contarlo:
-- al aplicar, stock nuevo = stock actual + (contado - stock_sistema), así las ventas hechas
-- durante el conteo no se pierden.
CREATE TABLE IF NOT EXISTS pc_conteo_detalle (
    id_detalle INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_conteo INT NOT NULL,
    id_producto INT NOT NULL,
    stock_sistema INT NOT NULL,
    contado INT NOT NULL,
    diferencia INT NOT NULL DEFAULT 0,
    stock_antes INT NULL COMMENT 'Stock real justo antes de aplicar',
    stock_final INT NULL COMMENT 'Stock que quedó al aplicar',
    costo DECIMAL(12,2) NULL COMMENT 'Costo unitario usado para valorizar (costo o precio de venta)',
    id_usuario INT NULL,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_conteo_producto (id_conteo, id_producto),
    KEY idx_producto (id_producto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
