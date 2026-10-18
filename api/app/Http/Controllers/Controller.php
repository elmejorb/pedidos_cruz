<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;
use Laravel\Lumen\Routing\Controller as BaseController;

class Controller extends BaseController
{
    private static $columnasCache = [];

    /**
     * Deja solo las claves que existen como columna en la tabla.
     * Permite desplegar código con campos nuevos antes de correr la migración.
     */
    protected function soloColumnasExistentes(string $tabla, array $datos): array
    {
        if (!isset(self::$columnasCache[$tabla])) {
            self::$columnasCache[$tabla] = Schema::getColumnListing($tabla);
        }
        return array_intersect_key($datos, array_flip(self::$columnasCache[$tabla]));
    }

    /** Identificador único enviado por la app cuando el registro se creó sin conexión */
    protected function uuidOffline($request, string $tabla): ?string
    {
        $uuid = trim((string) $request->input('uuid_offline', ''));
        if ($uuid === '' || !preg_match('/^[A-Za-z0-9_-]{8,40}$/', $uuid)) return null;
        return $this->soloColumnasExistentes($tabla, ['uuid_offline' => 1]) ? $uuid : null;
    }

    /** Fecha real en que se tomó el registro en el celular (máx. 7 días atrás, nunca futura) */
    protected function fechaOffline($request): ?Carbon
    {
        $f = $request->input('fecha_offline');
        if (!$f) return null;
        try {
            // config('app.timezone') vale UTC en este Lumen; la zona real se fija en bootstrap/app.php
            $fecha = Carbon::parse($f)->setTimezone(date_default_timezone_get());
        } catch (\Exception $e) {
            return null;
        }
        $ahora = Carbon::now();
        if ($fecha->gt($ahora) || $fecha->lt($ahora->copy()->subDays(7))) return null;
        return $fecha;
    }
}
