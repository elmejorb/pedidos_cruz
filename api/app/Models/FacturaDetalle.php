<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FacturaDetalle extends Model
{
    protected $table = 'pc_factura_detalle';
    protected $primaryKey = 'id_detalle';
    public $timestamps = false;

    protected $fillable = [
        'id_factura', 'id_producto', 'codigo', 'descripcion', 'unit_measure_id', 'unidad',
        'cantidad', 'precio', 'descuento', 'iva_porcentaje', 'base', 'iva', 'total'
    ];
}
