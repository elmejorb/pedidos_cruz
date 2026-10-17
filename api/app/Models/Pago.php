<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Pago extends Model
{
    protected $table = 'pc_pagos';
    protected $primaryKey = 'id_pago';

    const MEDIOS = ['efectivo', 'transferencia', 'consignacion', 'nequi', 'daviplata', 'tarjeta', 'cheque', 'otro'];

    protected $fillable = [
        'id_pedido', 'id_cliente', 'fecha', 'valor', 'medio_pago', 'referencia', 'notas',
        'id_usuario', 'anulado', 'anulado_por', 'anulado_at', 'motivo_anulacion'
    ];

    protected $casts = [
        'valor' => 'float',
        'anulado' => 'boolean',
    ];

    public function pedido()
    {
        return $this->belongsTo(Pedido::class, 'id_pedido', 'id_pedido');
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class, 'id_cliente', 'id_cliente');
    }

    public function usuario()
    {
        return $this->belongsTo(Usuario::class, 'id_usuario', 'id_usuario');
    }

    /** Total pagado (no anulado) de un pedido */
    public static function pagadoDe($idPedido): float
    {
        return (float) static::where('id_pedido', $idPedido)->where('anulado', 0)->sum('valor');
    }
}
