import bpy, math, os, sys
from mathutils import Vector, Matrix, Euler

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- utils
def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c]

def mat(name, hexcol, metal=0.0, rough=0.6, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hexcol), 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*lin(emit), 1)
        b.inputs['Emission Strength'].default_value = strength
    m.diffuse_color = (*lin(hexcol), 1)
    m.metallic = metal
    m.roughness = rough
    return m

def finish(o, material, name, bevel=0.0015):
    o.name = name
    o.data.name = name
    o.data.materials.clear()
    o.data.materials.append(material)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        md = o.modifiers.new('bv', 'BEVEL')
        md.width = bevel
        md.segments = 1
        md.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier='bv')
    bpy.ops.object.shade_flat()
    o.select_set(False)
    return o

def cyl(name, r, depth, loc, rot, material, verts=12, r2=None, bevel=0.0015):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        rot = (-rot[0], rot[1], rot[2])   # cono: radius1 queda en -Y, radius2 en +Y
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.active_object, material, name, bevel)

def cube(name, size, loc, rot, material, bevel=0.0015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, material, name, bevel)

def sphere(name, r, loc, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=loc)
    return finish(bpy.context.active_object, material, name, 0)

def clear():
    # Archivo vacío con datos de fábrica (sin tocar las preferencias del usuario ni sus addons)
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)

# palette: sala de servidores (metal oscuro, naranja de alerta, lente calida)
C_METAL = '#3a3f44'
C_METAL2 = '#6a7076'
C_RUBBER = '#141516'
C_ORANGE = '#fb923c'
C_RED = '#b1390a'
C_GLOVE = '#565b60'
C_SLEEVE = '#2e3742'   # chaqueta técnica azul pizarra
C_CUFF = '#1e242b'
C_SKIN = '#b98262'
C_NAIL = '#d9a491'

# ---------------------------------------------------------------- flashlight
def build_flashlight(prefix='', origin=(0, 0, 0), rot=(0, 0, 0)):
    """Linterna con eje a lo largo de +Y (adelante en Blender = -Z en glTF). Origen en el centro del agarre."""
    mm = mat('FL_Metal', C_METAL, 0.85, 0.42)
    mm2 = mat('FL_Metal2', C_METAL2, 0.8, 0.35)
    mr = mat('FL_Rubber', C_RUBBER, 0.0, 0.9)
    mo = mat('FL_Orange', C_ORANGE, 0.0, 0.5, emit=C_ORANGE, strength=0.6)
    ml = mat('FL_Lens', '#fff4d6', 0.0, 0.1, emit='#fff1c9', strength=6.0)
    R = Matrix.Rotation(math.pi / 2, 4, 'X')
    parts = []
    def P(o): parts.append(o); return o
    x90 = (math.pi / 2, 0, 0)
    P(cyl(prefix + 'Body', 0.021, 0.14, (0, -0.01, 0), x90, mm, 12))
    for i, y in enumerate((-0.05, -0.03, -0.01, 0.01)):
        P(cyl(prefix + f'Grip{i}', 0.0228, 0.009, (0, y, 0), x90, mr, 12))
    P(cyl(prefix + 'Band', 0.0226, 0.008, (0, 0.037, 0), x90, mo, 12))
    P(cyl(prefix + 'Tail', 0.0195, 0.012, (0, -0.086, 0), x90, mm2, 12))
    P(cyl(prefix + 'TailRing', 0.0225, 0.004, (0, -0.079, 0), x90, mo, 12))
    P(cyl(prefix + 'Head', 0.022, 0.05, (0, 0.07, 0), x90, mm2, 12, r2=0.0345))
    P(cyl(prefix + 'Bezel', 0.0365, 0.008, (0, 0.099, 0), x90, mr, 12))
    P(cyl(prefix + 'Lens', 0.029, 0.003, (0, 0.1025, 0), x90, ml, 12, bevel=0))
    P(cube(prefix + 'Switch', (0.012, 0.022, 0.007), (0, -0.02, 0.0225), (0, 0, 0), mo))
    P(cube(prefix + 'Clip', (0.004, 0.06, 0.004), (0, -0.01, -0.0225), (0, 0, 0), mm2))
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    fl = bpy.context.active_object
    fl.name = prefix + 'Flashlight'
    fl.data.name = prefix + 'Flashlight'
    bpy.ops.object.select_all(action='DESELECT')
    # punto de luz: aqui se pega el SpotLight en three.js
    e = bpy.data.objects.new(prefix + 'LightPoint', None)
    e.empty_display_type = 'SINGLE_ARROW'
    e.empty_display_size = 0.03
    bpy.context.collection.objects.link(e)
    e.location = (0, 0.104, 0)
    e.parent = fl
    fl.location = origin
    fl.rotation_euler = rot
    return fl, e

# ---------------------------------------------------------------- hands
FINGERS = {
    #       x offset, widths, phalanx lengths
    'Index':  (-0.030, 0.019, (0.034, 0.022, 0.019)),
    'Middle': (-0.010, 0.020, (0.038, 0.025, 0.020)),
    'Ring':   (0.010, 0.019, (0.034, 0.023, 0.019)),
    'Pinky':  (0.029, 0.017, (0.027, 0.018, 0.016)),
}
THUMB = (0.036, 0.030, 0.026)
THUMB_ANG = 30   # apertura del pulgar respecto al índice (grados)
ARM_X = 0.22
PALM_L = 0.092

def build_arms():

    # armature
    arm_data = bpy.data.armatures.new('RigData')
    rig = bpy.data.objects.new('Rig', arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    parts = []  # (obj, bone)

    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        return b

    plan = []
    for side, sx in (('R', 1), ('L', -1)):
        ox = sx * ARM_X
        bone(f'{side}_Arm', (ox, -0.55, 0), (ox, -0.04, 0))
        bone(f'{side}_Hand', (ox, -0.04, 0), (ox, PALM_L, 0), f'{side}_Arm')
        for fname, (fx, w, ls) in FINGERS.items():
            x = ox - sx * fx   # indice cerca del pulgar
            y = PALM_L
            par = f'{side}_Hand'
            for i, l in enumerate(ls, 1):
                n = f'{side}_{fname}{i}'
                bone(n, (x, y, 0), (x, y + l, 0), par)
                plan.append(('finger', side, sx, fname, i, x, y, l, w, n))
                par = n
                y += l
        # pulgar
        th = math.radians(THUMB_ANG) * sx
        d = Vector((-math.sin(th), math.cos(th), 0)) if False else Vector((-sx * math.sin(math.radians(THUMB_ANG)), math.cos(math.radians(THUMB_ANG)), 0))
        pos = Vector((ox - sx * 0.037, 0.016, -0.002))
        par = f'{side}_Hand'
        for i, l in enumerate(THUMB, 1):
            n = f'{side}_Thumb{i}'
            bone(n, pos, pos + d * l, par)
            plan.append(('thumb', side, sx, 'Thumb', i, pos.copy(), d.copy(), l, 0.021, n))
            pos = pos + d * l
            par = n
    bpy.ops.object.mode_set(mode='OBJECT')

    # ------------------------------------------------------------ geometria (manos humanas)
    import bmesh
    from mathutils import Vector as V

    m_skin = mat('Skin', C_SKIN, 0.0, 0.52)
    try:
        bsdf = m_skin.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Subsurface Weight'].default_value = 0.12
        bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
        bsdf.inputs['Subsurface Scale'].default_value = 0.004
    except Exception:
        pass
    m_nail = mat('Nail', C_NAIL, 0.0, 0.32)
    m_sleeve = mat('Sleeve', C_SLEEVE, 0.0, 0.9)
    m_cuff = mat('Cuff', C_CUFF, 0.0, 0.95)
    m_strap = mat('WatchStrap', '#141414', 0.0, 0.7)
    m_case = mat('WatchCase', '#9aa0a6', 0.9, 0.3)
    m_dial = mat('WatchDial', '#0b1612', 0.0, 0.25, emit='#43ffaa', strength=0.5)

    def new_obj(name, bm):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        return o

    def apply_mods(o):
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        o.select_set(False)

    def smooth(o, material):
        o.data.materials.clear()
        o.data.materials.append(material)
        for p in o.data.polygons:
            p.use_smooth = True
        return o

    def skin_chain(name, pts, radii, material, levels=2, flat_z=1.0, axis_z=0.0):
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in pts]
        for a, b in zip(vs, vs[1:]):
            bm.edges.new((a, b))
        o = new_obj(name, bm)
        o.modifiers.new('sk', 'SKIN')
        for sv, r in zip(o.data.skin_vertices[0].data, radii):
            sv.radius = (r, r)
        o.data.skin_vertices[0].data[0].use_root = True
        ss = o.modifiers.new('ss', 'SUBSURF')
        ss.levels = levels
        apply_mods(o)
        if flat_z != 1.0:
            for v in o.data.vertices:
                v.co.z = axis_z + (v.co.z - axis_z) * flat_z
        return smooth(o, material)

    def blob(name, loc, scale, material, rotz=0.0, sub=2):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        R = Matrix.Rotation(rotz, 3, 'Z')
        for v in bm.verts:
            v.co = R @ V((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + V(loc)
        return smooth(new_obj(name, bm), material)

    def tube(name, y0, y1, rx, rz, segs, rings, material, inner=None, wobble=None, cx=0.0, cz=0.0):
        """Tubo a lo largo de Y. rx/rz: funciones t->radio (t 0..1). inner: (rx_in, rz_in) en el extremo y1 (borde visible)."""
        bm = bmesh.new()
        grid = []
        for j in range(rings + 1):
            t = j / rings
            y = y0 + (y1 - y0) * t
            ring = []
            for i in range(segs):
                a = 2 * math.pi * i / segs
                k = 1.0 + (wobble(i, j, a, t) if wobble else 0.0)
                ring.append(bm.verts.new((cx + math.cos(a) * rx(t) * k, y, cz + math.sin(a) * rz(t) * k)))
            grid.append(ring)
        for j in range(rings):
            for i in range(segs):
                a, b = grid[j][i], grid[j][(i + 1) % segs]
                c, d = grid[j + 1][(i + 1) % segs], grid[j + 1][i]
                bm.faces.new((a, b, c, d))
        if inner:
            rin_x, rin_z = inner
            ins = [bm.verts.new((cx + math.cos(2 * math.pi * i / segs) * rin_x, y1 - 0.004, cz + math.sin(2 * math.pi * i / segs) * rin_z)) for i in range(segs)]
            back = [bm.verts.new((cx + math.cos(2 * math.pi * i / segs) * rin_x, y0 + 0.01, cz + math.sin(2 * math.pi * i / segs) * rin_z)) for i in range(segs)]
            top = grid[-1]
            for i in range(segs):
                j2 = (i + 1) % segs
                bm.faces.new((top[i], top[j2], ins[j2], ins[i]))      # labio del puño
                bm.faces.new((ins[i], ins[j2], back[j2], back[i]))    # pared interior
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return smooth(new_obj(name, bm), material)

    def nail(name, x, y_tip, length, width, finger_obj, material):
        # se apoya sobre la cara dorsal real del dedo
        zs = [v.co.z for v in finger_obj.data.vertices if y_tip - length * 0.95 < v.co.y < y_tip - length * 0.15 and abs(v.co.x - x) < width * 0.3]
        ztop = max(zs) if zs else width * 0.42
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            u = v.co.x * 2  # -1..1 a lo ancho
            v.co = V((x + v.co.x * width * 0.72, y_tip - length * 0.52 + v.co.y * length * 0.62, ztop - 0.0006 + v.co.z * 0.0018 - (u * u) * 0.0009))
        o = new_obj(name, bm)
        md = o.modifiers.new('ss', 'SUBSURF')
        md.levels = 1
        apply_mods(o)
        return smooth(o, material)

    def smoothstep(e0, e1, x):
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)

    def weight_chain(o, bones, bounds, s_fn, blend):
        """bones[k] rige el tramo entre bounds[k-1] y bounds[k]; mezcla suave de ancho 2*blend en cada frontera."""
        groups = [o.vertex_groups.get(b) or o.vertex_groups.new(name=b) for b in bones]
        for v in o.data.vertices:
            s = s_fn(v.co)
            ts = [smoothstep(b - blend, b + blend, s) for b in bounds] + [0.0]
            w = [1.0 - ts[0]] + [ts[k] - ts[k + 1] for k in range(len(bounds))]
            for gk, wk in zip(groups, w):
                if wk > 1e-4:
                    gk.add([v.index], wk, 'REPLACE')

    def rigid(o, bone_name):
        g = o.vertex_groups.new(name=bone_name)
        g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')

    pieces = []
    for side, sx in (('R', 1), ('L', -1)):
        ox = sx * ARM_X
        WRIST_B = -0.04   # frontera hueso brazo / mano

        # --- palma: losa redondeada, más ancha en los nudillos y con el arco de la mano
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2.0)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
        y_lo, y_hi = -0.014, PALM_L + 0.004
        for v in bm.verts:
            u, t, w = v.co.x, (v.co.y + 1) / 2, v.co.z
            half_w = 0.031 + 0.013 * t
            half_t = 0.0150 - 0.0030 * t
            x = ox + u * half_w
            y = y_lo + (y_hi - y_lo) * t
            z = w * half_t
            if w > 0:
                z += 0.0065 * (1 - u * u)           # dorso arqueado
            else:
                z += 0.0035 * (1 - u * u) * t       # palma ligeramente cóncava
            v.co = V((x, y, z))
        palm = new_obj(f'{side}_PalmSkin', bm)
        md = palm.modifiers.new('ss', 'SUBSURF')
        md.levels = 2
        apply_mods(palm)
        smooth(palm, m_skin)
        weight_chain(palm, [f'{side}_Arm', f'{side}_Hand'], [WRIST_B], lambda c: c.y, 0.012)
        pieces.append(palm)

        # --- muñeca y antebrazo (lo que asoma del puño)
        wr = skin_chain(f'{side}_Wrist', [(ox, -0.17, 0), (ox, -0.10, 0), (ox, -0.05, 0), (ox, -0.006, 0)],
                        [0.033, 0.029, 0.0265, 0.031], m_skin, levels=2, flat_z=0.72)
        weight_chain(wr, [f'{side}_Arm', f'{side}_Hand'], [WRIST_B], lambda c: c.y, 0.012)
        pieces.append(wr)

        # --- eminencias tenar e hipotenar (dan volumen humano a la palma)
        th = blob(f'{side}_Thenar', (ox - sx * 0.022, 0.022, -0.004), (0.0145, 0.024, 0.0095), m_skin, rotz=sx * math.radians(22))
        pos0 = V((ox - sx * 0.037, 0.016, -0.002))
        dth = V((-sx * math.sin(math.radians(THUMB_ANG)), math.cos(math.radians(THUMB_ANG)), 0))
        weight_chain(th, [f'{side}_Hand', f'{side}_Thumb1'], [0.006], lambda c: (V(c) - pos0).dot(dth), 0.014)
        pieces.append(th)
        hy = blob(f'{side}_Hypothenar', (ox + sx * 0.024, 0.026, -0.004), (0.011, 0.028, 0.008), m_skin)
        rigid(hy, f'{side}_Hand')
        pieces.append(hy)

        # --- dedos
        for fname, (fx, w, ls) in FINGERS.items():
            x = ox - sx * fx
            r0 = w * 0.62
            y0 = PALM_L
            ys = [y0 - 0.014, y0, y0 + ls[0], y0 + ls[0] + ls[1], y0 + sum(ls) - 0.005]
            radii = [r0 * 1.05, r0, r0 * 0.93, r0 * 0.86, r0 * 0.74]
            fo = skin_chain(f'{side}_{fname}Skin', [(x, y, 0) for y in ys], radii, m_skin, levels=2, flat_z=0.86)
            bounds = [y0, y0 + ls[0], y0 + ls[0] + ls[1]]
            weight_chain(fo, [f'{side}_Hand', f'{side}_{fname}1', f'{side}_{fname}2', f'{side}_{fname}3'], bounds, lambda c: c.y, 0.0055)
            pieces.append(fo)
            nl = nail(f'{side}_{fname}Nail', x, y0 + sum(ls), ls[2], w * 0.62, fo, m_nail)
            rigid(nl, f'{side}_{fname}3')
            pieces.append(nl)
            kn = blob(f'{side}_{fname}Knuckle', (x, y0 - 0.005, 0.0108), (0.0068, 0.0075, 0.0036), m_skin, sub=2)
            rigid(kn, f'{side}_Hand')
            pieces.append(kn)

        # --- pulgar
        pts, p = [pos0 - dth * 0.012], pos0.copy()
        pts.append(p.copy())
        acc = 0.0
        for l in THUMB:
            p = p + dth * l
            acc += l
            pts.append(p.copy())
        pts[-1] = pts[-1] - dth * 0.005
        tr = 0.0118
        tho = skin_chain(f'{side}_ThumbSkin', [tuple(q) for q in pts], [tr * 1.15, tr * 1.05, tr * 0.98, tr * 0.9, tr * 0.78],
                         m_skin, levels=2, flat_z=0.88, axis_z=-0.002)
        b = [0.0, THUMB[0], THUMB[0] + THUMB[1]]
        weight_chain(tho, [f'{side}_Hand', f'{side}_Thumb1', f'{side}_Thumb2', f'{side}_Thumb3'], b,
                     lambda c: (V(c) - pos0).dot(dth), 0.007)
        pieces.append(tho)
        # uña del pulgar: se modela en el eje local del pulgar y se rota
        tip = pos0 + dth * sum(THUMB)
        tn = nail(f'{side}_ThumbNail', 0.0, 0.0, THUMB[2], 0.016, tho, m_nail)
        # nail() midió el dedo en coordenadas de mundo; aquí lo recolocamos sobre el pulgar
        ang = -math.atan2(dth.x, dth.y)
        Rz = Matrix.Rotation(ang, 3, 'Z')
        zs = [v.co.z for v in tho.data.vertices if (V(v.co) - tip).length < THUMB[2] * 0.9]
        ztop = max(zs) - 0.0006 if zs else 0.009
        zc = sum(v.co.z for v in tn.data.vertices) / len(tn.data.vertices)
        for v in tn.data.vertices:
            c = V((v.co.x, v.co.y, v.co.z))
            v.co = Rz @ V((c.x, c.y, 0)) + V((tip.x, tip.y, ztop + (c.z - zc)))
        rigid(tn, f'{side}_Thumb3')
        pieces.append(tn)

        # --- manga de chaqueta técnica (tela, con arrugas) y puño acanalado
        def wob(i, j, a, t):
            return 0.035 * math.sin(a * 3 + j * 1.7) * math.sin(t * math.pi * 3.0) + 0.02 * math.sin(a * 5 - j * 0.9)
        sl = tube(f'{side}_Sleeve', -0.60, -0.098, lambda t: 0.060 - 0.016 * t, lambda t: 0.054 - 0.013 * t,
                  20, 12, m_sleeve, wobble=wob, cx=ox)
        rigid(sl, f'{side}_Arm')
        pieces.append(sl)
        rib = lambda i, j, a, t: (0.035 if i % 2 else 0.0)
        cf = tube(f'{side}_Cuff', -0.118, -0.076, lambda t: 0.0425, lambda t: 0.0385, 32, 3, m_cuff,
                  inner=(0.034, 0.029), wobble=rib, cx=ox)
        rigid(cf, f'{side}_Arm')
        pieces.append(cf)

    # --- reloj en la muñeca izquierda (correa ajustada a la muñeca real)
    ox = -ARM_X
    wl = bpy.data.objects['L_Wrist']
    near = [v.co for v in wl.data.vertices if -0.060 < v.co.y < -0.040]
    rxw = max(abs(c.x - ox) for c in near) + 0.0012
    rzw = max(abs(c.z) for c in near) + 0.0012
    st = tube('L_WatchStrap', -0.059, -0.041, lambda t: rxw, lambda t: rzw, 24, 1, m_strap, cx=ox)
    rigid(st, 'L_Arm')
    pieces.append(st)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0165, radius2=0.0155, depth=0.008,
                          matrix=Matrix.Translation((ox, -0.050, rzw + 0.003)))
    case = smooth(new_obj('L_WatchCase', bm), m_case)
    rigid(case, 'L_Arm')
    pieces.append(case)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=0.0135, matrix=Matrix.Translation((ox, -0.050, rzw + 0.0072)))
    dial = smooth(new_obj('L_WatchDial', bm), m_dial)
    rigid(dial, 'L_Arm')
    pieces.append(dial)

    # unir todo en una sola malla con skinning
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    mesh = bpy.context.active_object
    mesh.name = 'Arms'
    mesh.data.name = 'Arms'
    bpy.ops.object.select_all(action='DESELECT')
    mesh.parent = rig
    md = mesh.modifiers.new('Armature', 'ARMATURE')
    md.object = rig
    return rig, mesh

# ---------------------------------------------------------------- poses
def curl(side, sx, spec):
    """spec: dict nombre_dedo -> (r1, r2, r3) en radianes (negativo = cerrar)."""
    out = {}
    for f, vals in spec.items():
        for i, v in enumerate(vals, 1):
            out[f'{side}_{f}{i}'] = (v, 0, 0)
    return out

def hand_pose(side, kind):
    sx = 1 if side == 'R' else -1
    P = {}
    if kind == 'idle':
        spec = {'Index': (-.25, -.35, -.25), 'Middle': (-.30, -.40, -.30), 'Ring': (-.36, -.45, -.30), 'Pinky': (-.42, -.50, -.35)}
        P.update(curl(side, sx, spec))
        P[f'{side}_Thumb1'] = (-.10, 0, -sx * .15)
        P[f'{side}_Thumb2'] = (-.15, 0, 0)
    elif kind == 'reach':
        spec = {'Index': (-.05, -.08, -.05), 'Middle': (-.06, -.08, -.05), 'Ring': (-.08, -.10, -.06), 'Pinky': (-.10, -.12, -.08)}
        P.update(curl(side, sx, spec))
        P[f'{side}_Thumb1'] = (0, 0, sx * .10)
    elif kind in ('hold', 'grab'):
        k = 1.0 if kind == 'hold' else 1.15
        spec = {'Index': (-1.0 * k, -1.35 * k, -0.95 * k), 'Middle': (-1.05 * k, -1.40 * k, -1.0 * k),
                'Ring': (-1.10 * k, -1.40 * k, -1.0 * k), 'Pinky': (-1.15 * k, -1.40 * k, -0.95 * k)}
        P.update(curl(side, sx, spec))
        P[f'{side}_Thumb1'] = (-.35, 0, -sx * .75)
        P[f'{side}_Thumb2'] = (-.55, 0, 0)
        P[f'{side}_Thumb3'] = (-.45, 0, 0)
    return P

def make_action(rig, name, right, left, extra=None, frames=(1, 30), sway=False):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
    pose = {}
    pose.update(hand_pose('R', right))
    pose.update(hand_pose('L', left))
    if extra:
        pose.update(extra)
    for pb in rig.pose.bones:
        pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
    for f in frames:
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_euler', frame=f)
    return act

def set_active(rig, act):
    rig.animation_data.action = act
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

# ---------------------------------------------------------------- render preview
def preview(path, cam_loc, target, lens=45, res=(900, 640), only=None):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.world = bpy.data.worlds.new('W')
    sc.world.color = (0.55, 0.56, 0.58)
    cam = bpy.data.objects.get('Cam')
    if not cam:
        cd = bpy.data.cameras.new('Cam')
        cam = bpy.data.objects.new('Cam', cd)
        bpy.context.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = cam_loc
    d = Vector(target) - Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def export_glb(path, selected_names, anims=False):
    bpy.ops.object.select_all(action='DESELECT')
    for n in selected_names:
        bpy.data.objects[n].select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
              export_materials='EXPORT', export_yup=True, export_cameras=False, export_lights=False)
    if anims:
        kw.update(export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                  export_anim_single_armature=True)
    else:
        kw.update(export_animations=False)
    bpy.ops.export_scene.gltf(**kw)

# ================================================================= main
if __name__ == '__main__':
    # --- 1) linterna suelta (pickup en el escenario)
    clear()
    fl, lp = build_flashlight()
    fl.rotation_euler = (0, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'flashlight.blend'))
    preview(os.path.join(OUT, 'preview_flashlight.png'), (0.40, -0.34, 0.22), (0, 0.01, 0), lens=50, res=(900, 520))
    export_glb(os.path.join(OUT, 'flashlight.glb'), ['Flashlight', 'LightPoint'])

    # --- 2) brazos + linterna en mano
    clear()
    rig, mesh = build_arms()
    fl, lp = build_flashlight(prefix='Held_')
    fl.rotation_euler = (math.radians(8), 0, math.radians(35))
    fl.location = (ARM_X, 0.072, -0.032)
    bpy.context.view_layer.update()
    # emparentar a la mano derecha (parent bone usa la COLA del hueso como origen)
    pb = rig.pose.bones['R_Hand']
    parent_mat = rig.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.length, 0))
    world = fl.matrix_world.copy()
    fl.parent = rig
    fl.parent_type = 'BONE'
    fl.parent_bone = 'R_Hand'
    fl.matrix_parent_inverse = parent_mat.inverted()
    fl.matrix_world = world

    roll = {'R_Arm': (0, -0.25, 0)}
    a_idle = make_action(rig, 'Idle', 'idle', 'idle')
    a_hold = make_action(rig, 'HoldFlashlight', 'hold', 'idle', extra=roll)
    a_reach = make_action(rig, 'Reach', 'reach', 'idle')
    a_grab = make_action(rig, 'Grab', 'grab', 'idle')
    # con la linterna en la derecha, se interactua con la izquierda
    a_hreach = make_action(rig, 'HoldReach', 'hold', 'reach', extra=roll)
    a_hgrab = make_action(rig, 'HoldGrab', 'hold', 'grab', extra=roll)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'arms.blend'))
    cam_loc = (0.05, -0.30, 0.50)
    tgt = (0.0, 0.05, -0.02)
    for act, nm in ((a_idle, 'idle'), (a_hold, 'hold'), (a_reach, 'reach'), (a_grab, 'grab')):
        set_active(rig, act)
        for n in ('Held_Flashlight',):
            bpy.data.objects[n].hide_render = (nm != 'hold')
        preview(os.path.join(OUT, f'preview_{nm}.png'), cam_loc, tgt, lens=28)
    bpy.data.objects['Held_Flashlight'].hide_render = False
    export_glb(os.path.join(OUT, 'arms.glb'), ['Rig', 'Arms', 'Held_Flashlight', 'Held_LightPoint'], anims=True)
    print('DONE')
