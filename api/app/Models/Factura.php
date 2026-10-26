<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Factura extends Model
{
    protected $table = 'pc_facturas';
    protected $primaryKey = 'id_factura';

    protected $fillable = [
        'id_pedido', 'estado', 'prefijo', 'numero', 'cufe', 'fecha_emision',
        'cliente_identificacion', 'cliente_dv', 'cliente_tipo_documento', 'cliente_nombre',
        'cliente_direccion', 'cliente_telefono', 'cliente_email', 'cliente_municipio',
        'forma_pago', 'medio_pago', 'dias_credito', 'fecha_vencimiento',
        'subtotal', 'iva', 'descuento', 'total', 'nota',
        'status_code', 'mensaje_dian', 'errores', 'request_json', 'response_json', 'intentos',
        'email_enviado', 'email_enviado_at', 'email_status', 'email_destinatario', 'email_status_at', 'id_usuario'
    ];

    protected $casts = [
        'errores' => 'array',
    ];

    protected $hidden = ['request_json', 'response_json'];

    public function pedido()
    {
        return $this->belongsTo(Pedido::class, 'id_pedido', 'id_pedido');
    }

    public function detalles()
    {
        return $this->hasMany(FacturaDetalle::class, 'id_factura', 'id_factura');
    }

    public function notasCredito()
    {
        return $this->hasMany(NotaCredito::class, 'id_factura', 'id_factura');
    }

    public function usuario()
    {
        return $this->belongsTo(Usuario::class, 'id_usuario', 'id_usuario');
    }
}
