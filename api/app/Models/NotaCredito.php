<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotaCredito extends Model
{
    protected $table = 'pc_notas_credito';
    protected $primaryKey = 'id_nota';

    protected $fillable = [
        'id_factura', 'estado', 'concepto', 'motivo', 'prefijo', 'numero', 'cufe', 'fecha_emision', 'total',
        'status_code', 'mensaje_dian', 'errores', 'request_json', 'response_json', 'id_usuario'
    ];

    protected $casts = ['errores' => 'array'];

    protected $hidden = ['request_json', 'response_json'];

    public function detalles()
    {
        return $this->hasMany(NotaCreditoDetalle::class, 'id_nota', 'id_nota');
    }

    public function factura()
    {
        return $this->belongsTo(Factura::class, 'id_factura', 'id_factura');
    }

    public function usuario()
    {
        return $this->belongsTo(Usuario::class, 'id_usuario', 'id_usuario');
    }
}
