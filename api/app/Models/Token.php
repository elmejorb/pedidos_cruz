<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Token extends Model
{
    protected $table = 'pc_tokens';
    protected $primaryKey = 'id_token';
    public $timestamps = false;

    protected $fillable = ['id_usuario', 'token', 'created_at', 'expires_at'];

    public function usuario()
    {
        return $this->belongsTo(Usuario::class, 'id_usuario', 'id_usuario');
    }
}
