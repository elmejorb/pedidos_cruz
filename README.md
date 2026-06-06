# Pedidos Cruz

Sistema de gestión de pedidos para vendedores. Permite manejar inventario, clientes, pedidos por ruta, despacho consolidado e impresión térmica.

## Stack

- **Backend:** Lumen 10 (PHP 8.2) + Eloquent ORM + MySQL
- **Frontend:** SPA Vanilla JS, CSS custom, Chart.js, FontAwesome
- **Impresión térmica:** Plugin Parzibyte (ESC/POS) opcional para impresión directa

## Estructura

```
pedidos_cruz/
├── api/                  # Backend Lumen
│   ├── app/
│   ├── routes/
│   └── public/
├── css/                  # Estilos del frontend
├── js/                   # JavaScript del frontend
├── img/                  # Imágenes
├── index.html            # App principal (login + dashboard)
└── catalogo.html         # Catálogo público de productos (sin login)
```

## Features

- Login multi-sesión (tokens 7 días)
- Roles: admin / vendedor
- CRUD: Productos (con foto), Clientes (con razón social y ruta), Pedidos, Categorías, Usuarios, Rutas
- Wizard de pedidos en 3 pasos con persistencia local
- Sistema Caja/Unidad con cálculo automático de stock
- Filtros avanzados de pedidos (estado, ruta, rangos de fecha)
- Módulo Despacho: consolidación de productos por ruta + impresión carta/ticket
- Impresión directa a térmica vía plugin Parzibyte
- Catálogo público de productos
- Dashboard con gráficos y reportes
- PWA-friendly, responsive móvil

## Despliegue

Configurar `.env` en `api/` con credenciales de DB y subir todo el proyecto al hosting.

URL del frontend público: https://pedidosgb.innovacion-digital.com
