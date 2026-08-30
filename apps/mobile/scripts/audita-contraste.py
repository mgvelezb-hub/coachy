"""Audita contraste de texto contra su fondo en las tres paletas."""
import re, json, sys
from pathlib import Path

RAIZ = Path("src")

def leer_paletas():
    fuente = (RAIZ / "lib/theme.ts").read_text()
    paletas = {}
    for nombre in ["paletteDark", "paletteLight", "paletteChampan"]:
        bloque = fuente.split(f"export const {nombre}: Palette = {{",1)[1].split("} as const;",1)[0]
        colores = dict(re.findall(r'(\w+):\s*"(#[0-9A-Fa-f]{6})"', bloque))
        paletas[nombre] = colores
    return paletas

def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    f=lambda v: v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=[f(x) for x in c]
    return 0.2126*r+0.7152*g+0.0722*b

def ratio(a,b):
    l1,l2=sorted([lum(a),lum(b)],reverse=True)
    return (l1+0.05)/(l2+0.05)

# Tamaños de la escala, para saber qué es "texto grande" (AA: 3:1)
TIPOS = {"hero":56,"display":40,"title":28,"heading":22,"subheading":18,"body":17,"bodySm":15,"label":13}

def fondos(paleta):
    # cardBg puede ser rgba sobre obsidiana: se aproxima con obsidiana.
    card = paleta.get("cardBg","")
    fondo_card = paleta["obsidiana"] if not card.startswith("#") else card
    return {
        "pantalla": paleta["obsidiana"],
        "tarjeta": fondo_card,
        "acento": paleta["guinda"],
    }

def analizar():
    paletas = leer_paletas()
    problemas = []
    for archivo in list(RAIZ.rglob("*.tsx")) + list(RAIZ.rglob("*.ts")):
        if "/test/" in str(archivo): continue
        fuente = archivo.read_text()
        # estilos del tipo: { fontFamily: ..., ...typeScale.X, color: colors.Y }
        for bloque in re.findall(r"\{[^{}]*typeScale\.\w+[^{}]*\}", fuente):
            tipo = re.search(r"typeScale\.(\w+)", bloque)
            color = re.search(r"color:\s*colors\.(\w+)", bloque)
            if not tipo or not color: continue
            tam = TIPOS.get(tipo.group(1))
            rol = color.group(1)
            if tam is None: continue
            negrita = "sansBold" in bloque or "sansSemiBold" in bloque
            minimo = 3.0 if (tam >= 24 or (tam >= 18 and negrita)) else 4.5
            for nombre_paleta, paleta in paletas.items():
                if rol not in paleta: continue
                for nombre_fondo, fondo in fondos(paleta).items():
                    # el texto sobre acento usa roles propios; se revisa aparte
                    # Sobre un fondo de acento solo van los roles pensados para
                    # eso; `marfil` es texto sobre pantalla o tarjeta.
                    if nombre_fondo == "acento" and rol not in ("pergamino","pergaminoSoft"): continue
                    if nombre_fondo != "acento" and rol in ("pergamino","pergaminoSoft"): continue
                    r = ratio(paleta[rol], fondo)
                    if r < minimo:
                        problemas.append((round(r,2), minimo, nombre_paleta, nombre_fondo, rol, tipo.group(1), str(archivo)))
    return problemas

p = analizar()
vistos = {}
for r, minimo, paleta, fondo, rol, tipo, archivo in p:
    clave = (paleta, fondo, rol, tipo)
    vistos.setdefault(clave, []).append(archivo)

print(f"combinaciones por debajo del mínimo: {len(vistos)}\n")
for (paleta, fondo, rol, tipo), archivos in sorted(vistos.items()):
    ejemplo = next(x for x in p if (x[2],x[3],x[4],x[5])==(paleta,fondo,rol,tipo))
    print(f"{ejemplo[0]:>5} (min {ejemplo[1]}) · {paleta:<15} {rol:<15} sobre {fondo:<9} · {tipo:<11} · {len(set(archivos))} archivos")
