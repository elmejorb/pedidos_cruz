<?php

namespace App\Http\Middleware;

use Closure;
use App\Models\Token;
use Carbon\Carbon;

class AuthMiddleware
{
    public function handle($request, Closure $next)
    {
        $tokenStr = $request->bearerToken();

        if (!$tokenStr) {
            return response()->json(['error' => true, 'mensaje' => 'Token no proporcionado'], 401);
        }

        $token = Token::with('usuario')
            ->where('token', $tokenStr)
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', Carbon::now());
            })
            ->first();

        if (!$token || !$token->usuario || !$token->usuario->activo) {
            return response()->json(['error' => true, 'mensaje' => 'Sesión expirada, inicia sesión nuevamente'], 401);
        }

        $request->merge(['usuario' => $token->usuario]);
        $request->usuario = $token->usuario;

        return $next($request);
    }
}
