# -*- coding: utf-8 -*-
"""Extrai imagens JPEG (DCTDecode) embutidas no PDF sem depender de libs.
Escreve page_XX.jpg em ./pdf_pages para eu ler visualmente."""
import os
import re

BASE = r"C:\Users\t825026\OneDrive - Santander Office 365\Documentos\DataMaster"
PDF = os.path.join(BASE, "Case DataMaster Engenharia AI.pdf")
OUT = os.path.join(BASE, "datamaster-app", "_assets_extracted", "pdf_pages")
os.makedirs(OUT, exist_ok=True)

data = open(PDF, "rb").read()
print("PDF size:", len(data))

# Localiza objetos de imagem com /DCTDecode e extrai o stream (JPEG puro).
# Estrategia: para cada "N 0 obj ... >> stream <bytes> endstream" que contenha
# /DCTDecode no dicionario, extrair os bytes do stream.
obj_re = re.compile(rb"(\d+)\s+0\s+obj(.*?)stream\r?\n", re.DOTALL)
count = 0
pos = 0
results = []
for m in obj_re.finditer(data):
    header = m.group(2)
    if b"/DCTDecode" not in header:
        continue
    objnum = int(m.group(1))
    # Length pode ser direto
    lm = re.search(rb"/Length\s+(\d+)", header)
    stream_start = m.end()
    if lm:
        length = int(lm.group(1))
        blob = data[stream_start:stream_start + length]
    else:
        # fallback: ate endstream
        end = data.find(b"endstream", stream_start)
        blob = data[stream_start:end]
    # dimensoes p/ nome
    wm = re.search(rb"/Width\s+(\d+)", header)
    hm = re.search(rb"/Height\s+(\d+)", header)
    wpx = int(wm.group(1)) if wm else 0
    hpx = int(hm.group(1)) if hm else 0
    # garante que comeca com marcador JPEG SOI 0xFFD8
    if not blob.startswith(b"\xff\xd8"):
        # tenta achar SOI dentro
        soi = blob.find(b"\xff\xd8")
        if soi >= 0:
            blob = blob[soi:]
    count += 1
    fn = os.path.join(OUT, f"img_{count:02d}_obj{objnum}_{wpx}x{hpx}.jpg")
    open(fn, "wb").write(blob)
    results.append((objnum, wpx, hpx, len(blob), fn))

with open(os.path.join(OUT, "_index.txt"), "w", encoding="utf-8") as f:
    for r in results:
        f.write(f"obj{r[0]} {r[1]}x{r[2]} bytes={r[3]} -> {os.path.basename(r[4])}\n")
print("extracted", count, "images ->", OUT)
for r in results:
    print(f"  obj{r[0]} {r[1]}x{r[2]} bytes={r[3]} {os.path.basename(r[4])}")
