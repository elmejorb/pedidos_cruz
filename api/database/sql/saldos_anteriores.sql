-- Saldos anteriores de clientes (deudas de antes de usar la app)
-- Se guardan como documentos en pc_pedidos con tipo = 'saldo_anterior' para que la cartera,
-- los abonos (pc_pagos), los recibos y los vencimientos funcionen igual que con los pedidos.
-- No tienen productos, no mueven inventario ni cuentan como ventas.
ALTER TABLE pc_pedidos
    ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'pedido' AFTER numero_pedido,
    ADD COLUMN documento_ref VARCHAR(40) NULL COMMENT 'Número del documento original (saldo anterior)' AFTER tipo,
    ADD COLUMN valor_original DECIMAL(12,2) NULL COMMENT 'Valor original del documento (saldo anterior)' AFTER total,
    ADD KEY idx_pedidos_tipo (tipo);
