-- ============================================================
-- Catálogos, proveedores y precio de costo - Pedidos Cruz
-- ============================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS pc_proveedores (
    id_proveedor INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    nit VARCHAR(30) NULL,
    telefono VARCHAR(30) NULL,
    contacto VARCHAR(120) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pc_productos
    ADD COLUMN precio_costo DECIMAL(12,2) NULL DEFAULT NULL AFTER precio,
    ADD COLUMN id_proveedor INT NULL DEFAULT NULL AFTER id_categoria,
    ADD KEY idx_proveedor (id_proveedor);

-- Catálogos: agrupan productos y se asignan a vendedores
CREATE TABLE IF NOT EXISTS pc_catalogos (
    id_catalogo INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255) NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#6366F1',
    codigo VARCHAR(20) NOT NULL COMMENT 'Código para el enlace público catalogo.html?c=',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_catalogo_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pc_catalogo_producto (
    id_catalogo INT NOT NULL,
    id_producto INT NOT NULL,
    PRIMARY KEY (id_catalogo, id_producto),
    KEY idx_producto (id_producto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pc_catalogo_vendedor (
    id_catalogo INT NOT NULL,
    id_usuario INT NOT NULL,
    PRIMARY KEY (id_catalogo, id_usuario),
    KEY idx_usuario (id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajustes generales (clave/valor)
CREATE TABLE IF NOT EXISTS pc_ajustes (
    clave VARCHAR(60) NOT NULL PRIMARY KEY,
    valor VARCHAR(255) NULL,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO pc_ajustes (clave, valor) VALUES ('catalogo_general_publico', '1');
