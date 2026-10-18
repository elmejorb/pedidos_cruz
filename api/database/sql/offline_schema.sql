-- ============================================================
-- Modo sin conexión (PWA) - Pedidos Cruz
-- Identificador único generado en el celular para que un pedido/abono
-- enviado dos veces (señal intermitente) no se cree duplicado.
-- ============================================================
ALTER TABLE pc_pedidos
    ADD COLUMN uuid_offline VARCHAR(40) NULL DEFAULT NULL,
    ADD UNIQUE KEY uq_pedidos_uuid_offline (uuid_offline);

ALTER TABLE pc_pagos
    ADD COLUMN uuid_offline VARCHAR(40) NULL DEFAULT NULL,
    ADD UNIQUE KEY uq_pagos_uuid_offline (uuid_offline);
