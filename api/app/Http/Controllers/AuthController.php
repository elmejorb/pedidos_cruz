<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Usuario;
use App\Models\Token;
use Carbon\Carbon;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $this->validate($request, [
            'email' => 'required|email',
            'password' => 'required'
        ]);

        $usuario = Usuario::where('email', $request->email)
            ->where('activo', 1)
            ->first();

        if (!$usuario || md5($request->password) !== $usuario->password) {
            return response()->json([
                'error' => true,
                'mensaje' => 'Credenciales incorrectas'
            ], 401);
        }

        // Clean expired tokens
        Token::where('id_usuario', $usuario->id_usuario)
            ->where('expires_at', '<', Carbon::now())
            ->delete();

        // Create new token (expires in 7 days)
        $tokenStr = bin2hex(random_bytes(32));
        Token::create([
            'id_usuario' => $usuario->id_usuario,
            'token' => $tokenStr,
            'created_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addDays(7),
        ]);

        return response()->json([
            'error' => false,
            'mensaje' => 'Login exitoso',
            'token' => $tokenStr,
            'usuario' => [
                'id_usuario' => $usuario->id_usuario,
                'nombre' => $usuario->nombre,
                'email' => $usuario->email,
                'rol' => $usuario->rol,
                'foto' => $usuario->foto,
                'telefono' => $usuario->telefono,
            ]
        ]);
    }

    public function registro(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para crear usuarios'], 403);
        }

        $this->validate($request, [
            'nombre' => 'required|string|max:150',
            'email' => 'required|email|unique:pc_usuarios,email',
            'password' => 'required|min:6',
            'rol' => 'in:admin,vendedor',
        ]);

        $usuario = Usuario::create([
            'nombre' => $request->nombre,
            'email' => $request->email,
            'password' => md5($request->password),
            'telefono' => $request->telefono ?? null,
            'rol' => $request->rol ?? 'vendedor',
            'activo' => 1,
        ]);

        return response()->json([
            'error' => false,
            'mensaje' => 'Usuario creado exitosamente',
            'usuario' => $usuario
        ], 201);
    }

    public function perfil(Request $request)
    {
        $usuario = $request->usuario;
        return response()->json([
            'error' => false,
            'usuario' => [
                'id_usuario' => $usuario->id_usuario,
                'nombre' => $usuario->nombre,
                'email' => $usuario->email,
                'rol' => $usuario->rol,
                'foto' => $usuario->foto,
                'telefono' => $usuario->telefono,
            ]
        ]);
    }

    public function actualizarPerfil(Request $request)
    {
        $usuario = $request->usuario;

        // If changing password, require current password
        if ($request->has('password') && $request->password != '') {
            if (!$request->has('password_actual') || $request->password_actual == '') {
                return response()->json(['error' => true, 'mensaje' => 'Debes ingresar tu contraseña actual'], 400);
            }
            if (md5($request->password_actual) !== $usuario->password) {
                return response()->json(['error' => true, 'mensaje' => 'Contraseña actual incorrecta'], 400);
            }
            $usuario->password = md5($request->password);
        }

        if ($request->has('nombre')) $usuario->nombre = $request->nombre;
        if ($request->has('telefono')) $usuario->telefono = $request->telefono;
        if ($request->has('email')) $usuario->email = $request->email;

        $usuario->save();

        return response()->json([
            'error' => false,
            'mensaje' => 'Perfil actualizado',
            'usuario' => [
                'id_usuario' => $usuario->id_usuario,
                'nombre' => $usuario->nombre,
                'email' => $usuario->email,
                'rol' => $usuario->rol,
                'foto' => $usuario->foto,
                'telefono' => $usuario->telefono,
            ]
        ]);
    }

    public function logout(Request $request)
    {
        // Only delete the current token, not all sessions
        $tokenStr = $request->bearerToken();
        if ($tokenStr) {
            Token::where('token', $tokenStr)->delete();
        }

        return response()->json(['error' => false, 'mensaje' => 'Sesión cerrada']);
    }

    public function usuarios(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para ver usuarios'], 403);
        }

        $usuarios = Usuario::select('id_usuario', 'nombre', 'email', 'rol', 'telefono', 'activo', 'created_at')
            ->orderBy('nombre')
            ->get();

        return response()->json(['error' => false, 'usuarios' => $usuarios]);
    }

    public function verUsuario(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }

        $usuario = Usuario::select('id_usuario', 'nombre', 'email', 'rol', 'telefono', 'activo', 'created_at')
            ->find($id);

        if (!$usuario) {
            return response()->json(['error' => true, 'mensaje' => 'Usuario no encontrado'], 404);
        }

        return response()->json(['error' => false, 'usuario' => $usuario]);
    }

    public function actualizarUsuario(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }

        $usuario = Usuario::find($id);
        if (!$usuario) {
            return response()->json(['error' => true, 'mensaje' => 'Usuario no encontrado'], 404);
        }

        $this->validate($request, [
            'nombre' => 'sometimes|required|string|max:150',
            'email' => 'sometimes|required|email|unique:pc_usuarios,email,' . $id . ',id_usuario',
            'rol' => 'sometimes|in:admin,vendedor',
        ]);

        if ($request->has('nombre')) $usuario->nombre = $request->nombre;
        if ($request->has('email')) $usuario->email = $request->email;
        if ($request->has('telefono')) $usuario->telefono = $request->telefono;
        if ($request->has('rol')) $usuario->rol = $request->rol;
        if ($request->has('activo')) $usuario->activo = $request->activo ? 1 : 0;

        if ($request->has('password') && $request->password != '') {
            $usuario->password = md5($request->password);
        }

        $usuario->save();

        return response()->json([
            'error' => false,
            'mensaje' => 'Usuario actualizado',
            'usuario' => [
                'id_usuario' => $usuario->id_usuario,
                'nombre' => $usuario->nombre,
                'email' => $usuario->email,
                'rol' => $usuario->rol,
                'telefono' => $usuario->telefono,
                'activo' => $usuario->activo,
            ]
        ]);
    }
}
