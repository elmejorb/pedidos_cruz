-- ============================================================
-- Estado del correo de la factura electrónica (lo reporta la API: Brevo/Resend)
-- enviado, entregado, abierto, clic, diferido, rebote_temporal, rebote_permanente,
-- bloqueado, spam, invalido, desuscrito
-- ============================================================
SET NAMES utf8mb4;

ALTER TABLE pc_facturas
    ADD COLUMN email_status VARCHAR(30) NULL DEFAULT NULL AFTER email_enviado_at,
    ADD COLUMN email_destinatario VARCHAR(255) NULL DEFAULT NULL AFTER email_status,
    ADD COLUMN email_status_at DATETIME NULL DEFAULT NULL AFTER email_destinatario;
