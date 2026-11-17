"""Exporta el .blend abierto a .glb (mismo nombre y carpeta, o la ruta dada después de --).

Uso:  blender -b models3d/kernelpanic_mapa.blend -P models3d/export_glb.py [-- salida.glb]
Lo usa el plugin de Vite (vite.config.js) para que el juego se actualice al guardar en Blender.
"""
import bpy, os, sys

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.splitext(bpy.data.filepath)[0] + '.glb'
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_yup=True,
    export_apply=True,       # aplica modificadores
    export_extras=True,      # userData: colision, interactivo, zona, luz_tipo...
    export_lights=False,     # las luces se crean en three.js desde los vacíos LP_*
    export_cameras=False,
    export_animations=False,
    use_visible=True,        # deja fuera objetos ocultos (p. ej. las plantillas Rack_42U_*)
)
print('EXPORTADO', out)
