// Chaves estruturais — Guia §13/§14/§25. A chave minima obrigatoria e
// `Destino no Template | Grupo | Sub Categoria`. Chave/Chave Destino so
// existem quando Alocacao da Hierarquia = "Sim" (senao vazias).

/** make_structural_key (py L217-222): tupla normalizada por trim. */
export function structuralKey(destino, grupo, subCategoria) {
  return [
    String(destino ?? '').trim(),
    String(grupo ?? '').trim(),
    String(subCategoria ?? '').trim(),
  ].join('|');
}

/** Chave da ORIGEM: Origem|Grupo|Sub (so quando alocacao === 'Sim'). */
export function chaveOrigem(row) {
  if (row.alocacaoHierarquia !== 'Sim') return '';
  return [
    String(row.origem ?? '').trim(),
    String(row.grupo ?? '').trim(),
    String(row.subCategoria ?? '').trim(),
  ].join('|');
}

/** Chave do DESTINO: Destino|Grupo|Sub (so quando alocacao === 'Sim'). */
export function chaveDestino(row) {
  if (row.alocacaoHierarquia !== 'Sim') return '';
  return [
    String(row.destino ?? '').trim(),
    String(row.grupo ?? '').trim(),
    String(row.subCategoria ?? '').trim(),
  ].join('|');
}
