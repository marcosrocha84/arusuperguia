// Fase 1.5 da migração de marca: copia todos os arquivos dos buckets
// antigos (arusuperguia-*) para os novos (orbita-*, já criados por
// sql/024_buckets_orbita.sql). Não apaga nada dos buckets antigos — a
// exclusão só deve acontecer na Fase 1.8, depois de validar tudo em
// produção.
//
// Uso:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrar-buckets-orbita.mjs
//   (adicione --dry-run pra só listar o que seria copiado, sem transferir nada)
//
// A service role key fica só na variável de ambiente da sua sessão do
// terminal — nunca cole ela num arquivo do repositório. Pegue-a em
// Supabase Dashboard > Project Settings > API > service_role (secret).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como variáveis de ambiente antes de rodar.');
    process.exit(1);
}

const PARES_DE_BUCKETS = [
    ['arusuperguia-fotos', 'orbita-fotos'],
    ['arusuperguia-regulamentos', 'orbita-regulamentos'],
    ['arusuperguia-patrocinadores', 'orbita-patrocinadores'],
    ['arusuperguia-temas', 'orbita-temas'],
];

const headersPadrao = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

// A API de list do Storage só lista um nível por vez — pastas (ex:
// "diagnostico/") aparecem como entradas sem "id"/"metadata". Por isso
// precisamos descer recursivamente em cada uma.
async function listarArquivosRecursivo(bucket, prefixo = '') {
    const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { ...headersPadrao, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: prefixo, limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!resposta.ok) {
        throw new Error(`Falha ao listar ${bucket}/${prefixo}: ${resposta.status} ${await resposta.text()}`);
    }
    const entradas = await resposta.json();
    let arquivos = [];
    for (const entrada of entradas) {
        const caminho = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;
        const ehPasta = entrada.id === null && entrada.metadata === null;
        if (ehPasta) {
            arquivos = arquivos.concat(await listarArquivosRecursivo(bucket, caminho));
        } else {
            arquivos.push(caminho);
        }
    }
    return arquivos;
}

async function copiarArquivo(bucketOrigem, bucketDestino, caminho) {
    const download = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketOrigem}/${encodeURI(caminho)}`, {
        headers: headersPadrao,
    });
    if (!download.ok) {
        throw new Error(`Falha ao baixar ${bucketOrigem}/${caminho}: ${download.status}`);
    }
    const bytes = await download.arrayBuffer();
    const contentType = download.headers.get('content-type') || 'application/octet-stream';

    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketDestino}/${encodeURI(caminho)}`, {
        method: 'POST',
        headers: { ...headersPadrao, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes,
    });
    if (!upload.ok) {
        throw new Error(`Falha ao enviar ${bucketDestino}/${caminho}: ${upload.status} ${await upload.text()}`);
    }
}

async function main() {
    for (const [bucketOrigem, bucketDestino] of PARES_DE_BUCKETS) {
        console.log(`\n=== ${bucketOrigem} -> ${bucketDestino} ===`);
        const arquivos = await listarArquivosRecursivo(bucketOrigem);
        console.log(`${arquivos.length} arquivo(s) encontrado(s).`);

        if (DRY_RUN) {
            arquivos.forEach((caminho) => console.log(`  [dry-run] copiaria: ${caminho}`));
            continue;
        }

        let copiados = 0;
        let falhas = 0;
        for (const caminho of arquivos) {
            try {
                await copiarArquivo(bucketOrigem, bucketDestino, caminho);
                copiados++;
                if (copiados % 25 === 0) console.log(`  ...${copiados}/${arquivos.length} copiados`);
            } catch (erro) {
                falhas++;
                console.error(`  ERRO em ${caminho}: ${erro.message}`);
            }
        }
        console.log(`Concluído: ${copiados} copiados, ${falhas} falha(s).`);
    }
}

main().catch((erro) => {
    console.error('Erro fatal:', erro);
    process.exit(1);
});
