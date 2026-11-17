"""Planta del escape room KernelPanic. Celdas de 2 m. Compartido entre la validación local y Blender."""
W, H = 26, 20
CELL = 2.0

def build():
    g = [['#'] * W for _ in range(H)]

    def carve(x0, y0, x1, y1, ch='.'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                g[y][x] = ch

    def wall(x0, y0, x1, y1):
        carve(x0, y0, x1, y1, '#')

    # Zonas (x0, y0, x1, y1) en celdas
    zones = {
        'NOC':        (1, 1, 7, 5),
        'Pasillo':    (1, 7, 7, 12),
        'Recepcion':  (1, 14, 7, 18),
        'SalaRacks':  (9, 1, 19, 11),
        'Electrico':  (21, 1, 24, 4),
        'Enfriamiento': (21, 6, 24, 12),
        'Bodega':     (9, 13, 15, 18),
        'Boveda':     (17, 14, 24, 18),
    }
    for z in zones.values():
        carve(*z)

    # Pasillo serpenteante oeste
    wall(1, 9, 5, 9)
    wall(3, 11, 7, 11)
    # Enfriamiento en zigzag
    wall(21, 8, 23, 8)
    wall(22, 10, 24, 10)

    # Laberinto de racks en la sala principal ('R')
    def racks(x, ys):
        for y in ys:
            g[y][x] = 'R'
    racks(10, range(1, 9))
    racks(12, [3, 4, 5, 7, 8, 9, 10, 11])
    racks(14, [1, 2, 3, 4, 5, 7, 8, 9, 10])
    racks(16, [2, 3, 4, 5, 6, 8, 9, 10, 11])
    racks(18, range(1, 10))
    g[6][17] = 'R'   # tapón que obliga a rodear
    g[3][19] = 'R'   # esconde el rincón de la llave 1
    g[1][18] = '.'   # única entrada al rincón

    # Puertas: 'd' abierta, 'P' bloqueada por puzzle, 'B' blindada (salida)
    doors = {
        'Puerta_NOC_Pasillo':   (2, 6, 'd'),
        'Puerta_Pasillo_Recep': (6, 13, 'd'),
        'Puerta_NOC_Racks':     (8, 3, 'P'),    # se abre con el terminal (puzzle 1)
        'Puerta_Racks_Enfr':    (20, 11, 'd'),
        'Puerta_Enfr_Electrico': (23, 5, 'd'),
        'Puerta_Racks_Bodega':  (11, 12, 'P'),  # se abre al restaurar energía (puzzle 2)
        'Puerta_Bodega_Boveda': (16, 16, 'd'),
        'Puerta_Blindada':      (25, 16, 'B'),  # 3 cerraduras
    }
    for name, (x, y, ch) in doors.items():
        g[y][x] = ch

    # Puntos de interés
    poi = {
        'Spawn':        (3, 16),
        'Linterna':     (1, 18),
        'Terminal':     (4, 1),
        'Llave_1':      (19, 1),
        'Tablero':      (24, 2),
        'Llave_2':      (21, 1),
        'CajaFuerte':   (15, 18),
        'Gabinete':     (9, 18),
        'Llave_3':      (15, 18),
        'CRAC_1':       (24, 7),
        'CRAC_2':       (21, 12),
        'Pilas_1':      (1, 12),
        'Pilas_2':      (9, 11),
    }
    return g, zones, doors, poi


def zone_of(zones, x, y):
    for n, (x0, y0, x1, y1) in zones.items():
        if x0 <= x <= x1 and y0 <= y <= y1:
            return n
    return None


def world(x, y):
    """Centro de celda en metros (Blender: X derecha, Y norte)."""
    return (x * CELL + CELL / 2, (H - 1 - y) * CELL + CELL / 2)


if __name__ == '__main__':
    # Comprueba qué es alcanzable desde el inicio con las puertas de puzzle cerradas / abiertas
    from collections import deque
    g, zones, doors, poi = build()
    for y, row in enumerate(g):
        print(f"{y:2d} " + ''.join(row))
    def bfs(start, blocked=()):
        seen = {start}; q = deque([start])
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and g[ny][nx] in '.dPB' and g[ny][nx] not in blocked:
                    seen.add((nx, ny)); q.append((nx, ny))
        return seen
    s = poi['Spawn']
    for label, blocked in (('Puertas de puzzle cerradas', 'PB'), ('Todo abierto', '')):
        r = bfs(s, blocked)
        print(label + ':', ', '.join(k for k, v in poi.items() if v in r))
