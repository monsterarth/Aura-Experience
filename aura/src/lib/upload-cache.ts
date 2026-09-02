// src/lib/upload-cache.ts
// Cache-Control único para tudo que sobe ao bucket `images`.
//
// Um ano, e sem medo: TODO caminho de upload gera o nome com um UUID novo
// (`crypto.randomUUID()`) e nenhum deles usa `upsert: true` — o conteúdo de uma
// URL nunca muda. Trocar a imagem de um ativo/estrutura cria outro arquivo e
// regrava a coluna no banco, então o navegador nunca fica com foto velha.
//
// Por que isso importa: o egress do Supabase é cobrado por byte que sai. Com o
// padrão anterior (`max-age=3600`) cada pessoa rebaixava a mesma foto de hora em
// hora; e no caminho da URL assinada, que não tinha padrão nenhum, o header saía
// `max-age=undefined` — inválido, o que tirava o objeto do CDN e do cache do
// navegador de uma vez só.
export const UPLOAD_CACHE_CONTROL = '31536000';
