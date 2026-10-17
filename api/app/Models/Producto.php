<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Producto extends Model
{
    protected $table = 'pc_productos';
    protected $primaryKey = 'id_producto';

    protected $fillable = [
        'codigo', 'nombre', 'descripcion', 'id_categoria',
        'precio', 'stock', 'stock_minimo', 'unidades_por_caja', 'foto', 'activo',
        'iva', 'unit_measure_id'
    ];

    public function categoria()
    {
        return $this->belongsTo(Categoria::class, 'id_categoria', 'id_categoria');
    }
}
