<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotaCreditoDetalle extends Model
{
    protected $table = 'pc_nota_credito_detalle';
    protected $primaryKey = 'id_detalle';
    public $timestamps = false;

    protected $fillable = [
        'id_nota', 'id_detalle_factura', 'id_producto', 'codigo', 'descripcion', 'unidad', 'cantidad',
        'precio', 'iva_porcentaje', 'base', 'iva', 'total', 'unidades_stock'
    ];
}
